const DEFAULT_PERMISSION = Object.freeze({
  preset: 'super', scopes: ['*'], active: true, operation_version: 1
});

export function createAdminPermissionService(client) {
  async function listOperators() {
    const [profiles, permissions] = await Promise.all([
      client.list('profiles', { select: '*', role: 'eq.admin', order: 'created_at.asc', limit: 100 }),
      client.list('admin_operator_permissions', { select: '*', order: 'created_at.asc', limit: 100 })
    ]);
    const byProfile = new Map((permissions || []).map((row) => [String(row.profile_id), row]));
    return (profiles || []).map((profile) => ({
      ...profile,
      ...DEFAULT_PERMISSION,
      ...(byProfile.get(String(profile.id)) || {}),
      profile_id: profile.id
    }));
  }

  function listPermissionEvents(targetUserId, limit = 50) {
    return client.list('admin_permission_events', {
      select: '*', target_user_id: `eq.${targetUserId}`, order: 'created_at.desc', limit
    });
  }

  function savePermissions(item, values) {
    return client.rpc('admin_manage_operator_permissions', {
      p_target_user_id: item.profile_id,
      p_expected_version: Number(item.operation_version || 0),
      p_preset: values.preset,
      p_scopes: String(values.scopes_text || '').split('\n').map((value) => value.trim()).filter(Boolean),
      p_active: values.active === true || values.active === 'on' || values.active === 'true',
      p_reason: String(values.change_reason || '').trim()
    });
  }

  return { listOperators, listPermissionEvents, savePermissions };
}
