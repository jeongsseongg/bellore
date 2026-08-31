function flattenRequest(row) {
  const operation = Array.isArray(row.sell_service_operations)
    ? row.sell_service_operations[0]
    : row.sell_service_operations;
  return {
    ...row,
    ...(operation || {}),
    operation_version: Number(operation?.operation_version || 1)
  };
}

export function createAdminSellService(client) {
  async function listRequests(method = '') {
    const rows = await client.list('sell_service_requests', {
      select: '*,sell_service_operations(*)',
      ...(method ? { method: `eq.${method}` } : {}),
      order: 'created_at.desc',
      limit: 500
    });
    return (rows || []).map(flattenRequest);
  }

  function listOperationEvents(requestId, limit = 50) {
    return client.list('sell_service_operation_events', {
      select: '*', request_id: `eq.${requestId}`, order: 'created_at.desc', limit
    });
  }

  function saveOperation(item, values) {
    const reason = String(values.change_reason || '').trim();
    const patch = { ...values };
    delete patch.change_reason;
    return client.rpc('admin_manage_sell_service', {
      p_request_id: item.id,
      p_expected_version: Number(item.operation_version || 1),
      p_patch: patch,
      p_reason: reason
    });
  }

  return { listRequests, listOperationEvents, saveOperation };
}
