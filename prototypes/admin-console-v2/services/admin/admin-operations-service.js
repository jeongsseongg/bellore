import { createAdminRestClient } from '../platform/admin-rest-client.js?v=20260826-admin-crud-v1';
import { createAdminTradeService } from './admin-trade-service.js?v=20260826-admin-crud-v1';
import { createAdminCatalogService } from './admin-catalog-service.js?v=20260831-mypage-admin-contract-v1';
import { createAdminAccountService } from './admin-account-service.js?v=20260826-admin-crud-v1';

export function createAdminOperationsService({ getAccessToken, operatorId, fetchImpl }) {
  const client = createAdminRestClient({ getAccessToken, ...(fetchImpl ? { fetchImpl } : {}) });
  const trade = createAdminTradeService(client);
  const catalog = createAdminCatalogService(client, operatorId);
  const accounts = createAdminAccountService(client, operatorId);

  async function loadOverview() {
    const [tradeData, profiles, listings, support, notifications] = await Promise.all([
      trade.overview(), accounts.listProfiles(), catalog.listListings(),
      accounts.listSupportThreads(), accounts.listNotifications()
    ]);
    return { trade: tradeData, profiles, listings, support, notifications, sources: 5 };
  }

  return {
    client,
    trade,
    catalog,
    accounts,
    loadOverview
  };
}
