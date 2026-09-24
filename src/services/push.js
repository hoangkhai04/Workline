const webpush = require('web-push');
const dataService = require('./dataService');

const PUB = process.env.VAPID_PUBLIC_KEY;
const PRIV = process.env.VAPID_PRIVATE_KEY;
const enabled = Boolean(PUB && PRIV && process.env.VAPID_SUBJECT);

if (enabled) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT, PUB, PRIV);
} else {
  console.warn('[push] Thieu VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT - tat thong bao day.');
}

async function sendToMember(member, payload) {
  const subs = await dataService.getPushSubscriptionsFor(member.id);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: s.keys },
          JSON.stringify(payload)
        );
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await dataService.removePushSubscription(s.endpoint); // trinh duyet da huy dang ky
        } else {
          console.error('[push] Gui that bai:', err.statusCode || err.message);
        }
      }
    })
  );
}

// Goi sau khi luu thong bao moi: gui push toi nguoi nhan
async function pushForNotifications(requester, created) {
  if (!enabled || !created || created.length === 0) return;
  const members = await dataService.getAllMembers();
  for (const n of created) {
    if (n.read) continue;
    // Bo qua thong bao cu duoc dong bo len lan dau (tranh gui hang loat)
    const t = Date.parse(n.time);
    if (Number.isFinite(t) && Date.now() - t > 10 * 60 * 1000) continue;

    const to = String(n.to).toLowerCase();
    const target = members.find(
      (m) => String(m.id).toLowerCase() === to || (m.email || '').toLowerCase() === to
    );
    if (!target || target.id === requester.id) continue;

    await sendToMember(target, {
      title: n.subject || 'Workline',
      body: String(n.body || '').slice(0, 160),
      tag: n.id,
    });
  }
}

module.exports = { pushForNotifications, enabled };