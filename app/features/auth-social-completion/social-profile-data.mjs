const SOCIAL_PROVIDER_LABELS = Object.freeze({ google: 'Google', kakao: '카카오', naver: '네이버' });

export function normalizeSocialProvider(provider) {
  const value = String(provider || '').trim().toLowerCase();
  if (value === 'custom:naver' || value === 'naver') return 'naver';
  return Object.hasOwn(SOCIAL_PROVIDER_LABELS, value) ? value : '';
}

export function socialProviderKeys(user) {
  const values = [
    ...(Array.isArray(user?.app_metadata?.providers) ? user.app_metadata.providers : []),
    user?.app_metadata?.provider,
    ...(Array.isArray(user?.identities) ? user.identities.map((identity) => identity?.provider) : []),
  ];
  return [...new Set(values.map(normalizeSocialProvider).filter(Boolean))];
}

export function socialProviderLabels(user) {
  return socialProviderKeys(user).map((provider) => SOCIAL_PROVIDER_LABELS[provider]);
}

function text(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function first(sources, keys) {
  for (const source of sources) {
    for (const key of keys) {
      const value = text(source?.[key]);
      if (value) return value;
    }
  }
  return '';
}

function dateParts(value) {
  const digits = text(value).replace(/\D/g, '');
  if (digits.length !== 8) return '';
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function providerBirthDate(sources) {
  const full = first(sources, ['birth_date', 'birthdate', 'date_of_birth']);
  if (full) return dateParts(full);
  for (const source of sources) {
    const year = text(source?.birthyear || source?.birth_year).replace(/\D/g, '');
    const birthday = text(source?.birthday).replace(/\D/g, '');
    if (year.length === 4 && birthday.length === 4) return dateParts(`${year}${birthday}`);
  }
  return '';
}

function displayPhone(value) {
  let digits = text(value).replace(/\D/g, '');
  if (digits.startsWith('82') && digits.length >= 11) digits = `0${digits.slice(2)}`;
  return digits.length === 11 ? digits.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3') : text(value);
}

function addressSources(sources) {
  return sources.flatMap((source) => {
    const address = source?.address;
    return address && typeof address === 'object' ? [source, address] : [source];
  });
}

export function extractSocialPrefill(user, profile) {
  const identitySources = Array.isArray(user?.identities)
    ? user.identities.map((identity) => identity?.identity_data || {}).filter(Boolean) : [];
  const authSources = [...identitySources, user?.user_metadata || {}];
  const sources = [...authSources, profile || {}];
  const addresses = addressSources(sources);
  return {
    providerKeys: socialProviderKeys(user),
    providerLabels: socialProviderLabels(user),
    email: text(user?.email) || first(sources, ['email']),
    name: first(authSources, ['full_name', 'name', 'display_name', 'nickname', 'preferred_username'])
      || text(profile?.verified_name) || text(profile?.display_name),
    birthDate: dateParts(profile?.birth_date) || providerBirthDate(sources),
    phone: displayPhone(profile?.phone_verified === true
      ? profile?.phone : first(authSources, ['phone_number', 'mobile', 'phone'])),
    postcode: text(profile?.postcode) || first(addresses, ['postal_code', 'postcode', 'zip_code']),
    addr1: text(profile?.addr1) || first(addresses, ['address', 'formatted', 'road_address', 'address1', 'addr1']),
    addr2: text(profile?.addr2) || first(addresses, ['address2', 'addr2']),
    phoneVerified: profile?.phone_verified === true,
  };
}

export function missingSocialProfileFields(profile) {
  const missing = [];
  if (!text(profile?.verified_name)) missing.push('name');
  if (!dateParts(profile?.birth_date)) missing.push('birthDate');
  if (profile?.phone_verified !== true || text(profile?.phone).replace(/\D/g, '').length < 10) missing.push('phone');
  if (!text(profile?.postcode) || !text(profile?.addr1)) missing.push('address');
  return missing;
}

export async function loadSocialProfileState({ client, user }) {
  const providerKeys = socialProviderKeys(user);
  if (!providerKeys.length) return { required: false, complete: true, profile: null, prefill: extractSocialPrefill(user, null) };
  const result = await client.from('profiles')
    .select('id,display_name,verified_name,birth_date,phone,phone_verified,postcode,addr1,addr2')
    .eq('id', user.id).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error('SOCIAL_PROFILE_NOT_FOUND');
  const missing = missingSocialProfileFields(result.data);
  return {
    required: true,
    complete: missing.length === 0,
    missing,
    profile: result.data,
    prefill: extractSocialPrefill(user, result.data),
  };
}

export async function saveSocialProfile({ client, user, state, values }) {
  if (!socialProviderKeys(user).length) throw new Error('SOCIAL_LOGIN_REQUIRED');
  const verifiedMissing = missingSocialProfileFields({
    ...state.profile,
    postcode: values.postcode,
    addr1: values.addr1,
  }).filter((field) => field !== 'address');
  if (verifiedMissing.length) throw new Error('IDENTITY_VERIFICATION_REQUIRED');
  const displayName = text(state.profile?.verified_name) || text(values.name);
  const postcode = text(values.postcode);
  const addr1 = text(values.addr1);
  const addr2 = text(values.addr2);
  if (!displayName || !postcode || !addr1) throw new Error('SOCIAL_PROFILE_INCOMPLETE');

  const metadata = { ...(user.user_metadata || {}), display_name: displayName, postcode, addr1, addr2 };
  const authResult = await client.auth.updateUser({ data: metadata });
  if (authResult.error) throw authResult.error;
  const profileResult = await client.from('profiles').update({ display_name: displayName, postcode, addr1, addr2 })
    .eq('id', user.id)
    .select('id,display_name,verified_name,birth_date,phone,phone_verified,postcode,addr1,addr2')
    .single();
  if (profileResult.error) throw profileResult.error;
  return profileResult.data;
}

export function safeReturnPath(value, origin = globalThis.location?.origin || 'https://bellore.co.kr') {
  try {
    const target = new URL(value || '/', origin);
    return target.origin === origin ? `${target.pathname}${target.search}${target.hash}` : '/';
  } catch {
    return '/';
  }
}
