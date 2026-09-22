export function archiveDate(eventDate, enabled, startedAt = null) {
  if (!enabled || !eventDate) return null;
  const date = new Date(startedAt || eventDate + 'T00:00:00.000Z');
  date.setUTCMonth(date.getUTCMonth() + 3);
  return date.toISOString();
}

export function lifecycleValues(body, current = {}) {
  const eventDate = body.eventDate === undefined ? current.event_date || null : body.eventDate || null;
  if (body.eventDate !== undefined && (typeof body.eventDate !== 'string' || (eventDate && (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !Number.isFinite(Date.parse(eventDate)) || new Date(eventDate).toISOString().slice(0,10) !== eventDate)))) throw new Error('Choose a valid event date.');
  if (body.autoArchiveEnabled !== undefined && typeof body.autoArchiveEnabled !== 'boolean') throw new Error('Choose a valid automatic archive setting.');
  let enabled = body.autoArchiveEnabled ?? !!(current.auto_archive_enabled ?? true);
  let startedAt = current.auto_archive_started_at || null;
  const restoring = current.status === 'archived' && body.status && body.status !== 'archived';
  if (restoring) { enabled = false; startedAt = null; }
  else if (!enabled) startedAt = null;
  else if (current.auto_archive_enabled === 0 && body.autoArchiveEnabled === true) {
    const normal = archiveDate(eventDate, true);
    startedAt = normal && Date.parse(normal) <= Date.now() ? new Date().toISOString() : null;
  }
  return {event_date:eventDate, auto_archive_enabled:enabled?1:0, auto_archive_started_at:startedAt, expires_at:archiveDate(eventDate,enabled,startedAt)};
}

export async function archiveDue(env) {
  await env.DB.prepare("UPDATE galleries SET status='archived',updated_at=CURRENT_TIMESTAMP WHERE status!='archived' AND auto_archive_enabled=1 AND expires_at IS NOT NULL AND expires_at<=?").bind(new Date().toISOString()).run();
}
