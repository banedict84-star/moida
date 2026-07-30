let records = [];

self.onmessage = function(event) {
  const data = event.data || {};
  if (data.type === 'init') {
    records = Array.isArray(data.records) ? data.records : [];
    return;
  }
  if (data.type !== 'search') return;
  const keyword = String(data.keyword || '').toLowerCase().replace(/-/g, '');
  const ids = keyword ? records.filter(function(record) {
    return record.text.indexOf(keyword) >= 0;
  }).map(function(record) { return record.id; }) : [];
  self.postMessage({ type: 'result', requestId: data.requestId, ids: ids });
};
