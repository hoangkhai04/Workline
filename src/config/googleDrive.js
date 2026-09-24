const { google } = require('googleapis');

/**
 * Ket noi toi Google Drive bang Service Account.
 *
 * Ban can:
 * 1. Tao Service Account tren Google Cloud Console, bat Google Drive API.
 * 2. Tai file JSON key ve, dat noi dung (hoac duong dan file) vao bien moi truong:
 *    - GOOGLE_SERVICE_ACCOUNT_JSON: dan nguyen noi dung file JSON key vao (khuyen dung khi deploy)
 *    - hoac GOOGLE_APPLICATION_CREDENTIALS: duong dan toi file key.json (khi chay local)
 * 3. Tao 1 thu muc tren Google Drive rieng cua ban, Share thu muc do cho email cua
 *    Service Account (dang ...@...gserviceaccount.com) voi quyen "Editor".
 * 4. Lay ID cua thu muc (trong URL Drive) va dat vao bien GOOGLE_DRIVE_FOLDER_ID.
 */
function getAuth() {
  const scopes = ['https://www.googleapis.com/auth/drive'];

  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    return new google.auth.GoogleAuth({ credentials, scopes });
  }

  // Fallback: dung GOOGLE_APPLICATION_CREDENTIALS (duong dan file) - mac dinh cua googleapis
  return new google.auth.GoogleAuth({ scopes });
}

let driveClient = null;
function getDrive() {
  if (!driveClient) {
    const auth = getAuth();
    driveClient = google.drive({ version: 'v3', auth });
  }
  return driveClient;
}

const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const DB_FILE_NAME = process.env.GOOGLE_DRIVE_DB_FILENAME || 'workline-db.json';

let cachedFileId = null;

/**
 * Tim file database trong thu muc Drive; neu chua co thi tao moi voi du lieu mac dinh.
 */
async function findOrCreateDbFile() {
  if (cachedFileId) return cachedFileId;
  const drive = getDrive();

  const listRes = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and name = '${DB_FILE_NAME}' and trashed = false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (listRes.data.files && listRes.data.files.length > 0) {
    cachedFileId = listRes.data.files[0].id;
    return cachedFileId;
  }

  const defaultData = { members: [], resetTokens: [] };
  const createRes = await drive.files.create({
    requestBody: {
      name: DB_FILE_NAME,
      parents: [FOLDER_ID],
      mimeType: 'application/json',
    },
    media: {
      mimeType: 'application/json',
      body: JSON.stringify(defaultData, null, 2),
    },
    fields: 'id',
  });

  cachedFileId = createRes.data.id;
  return cachedFileId;
}

/**
 * Doc toan bo noi dung JSON database tu Google Drive.
 */
async function readDb() {
  const drive = getDrive();
  const fileId = await findOrCreateDbFile();

  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'text' }
  );

  const raw = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
  try {
    return JSON.parse(raw);
  } catch (err) {
    // File rong hoac loi -> tra ve cau truc mac dinh
    return { members: [], resetTokens: [] };
  }
}

/**
 * Ghi de toan bo noi dung JSON database len Google Drive.
 */
async function writeDb(data) {
  const drive = getDrive();
  const fileId = await findOrCreateDbFile();

  await drive.files.update({
    fileId,
    media: {
      mimeType: 'application/json',
      body: JSON.stringify(data, null, 2),
    },
  });

  return data;
}

module.exports = { readDb, writeDb };
