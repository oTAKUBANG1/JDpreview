// JD 岗位池：把用户贴过的 JD 匿名入库，去重、脱敏、记时效，供简历 → 岗位推荐使用。
// 只存 JD 文本，不存简历；JD 里常带 HR 手机号/邮箱，入库前统一打码。

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const DEFAULT_PATH = process.env.JD_DB ?? 'data/jdpool.sqlite';

export function scrubPii(text) {
  return String(text ?? '')
    .replace(/(?:\+?86[-\s]?)?1[3-9]\d{9}/g, '[手机号已隐藏]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[邮箱已隐藏]')
    .replace(/(微信|WeChat|wechat|QQ|qq)\s*[:：]?\s*[A-Za-z0-9_-]{5,}/g, '$1：[已隐藏]')
    .replace(/\b\d{17}[\dXx]\b/g, '[证件号已隐藏]');
}

function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。；：、,.;:!?！？\-—_（）()【】[\]「」“”"']/g, '');
}

export function fingerprint(title, company, text) {
  const basis = `${normalize(title)}|${normalize(company)}|${normalize(text).slice(0, 400)}`;
  return createHash('sha256').update(basis).digest('hex').slice(0, 32);
}

export function openStore(path = DEFAULT_PATH) {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA journal_mode = WAL');
  } catch {
    // 内存库不支持 WAL，忽略
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS jds (
      id INTEGER PRIMARY KEY,
      fingerprint TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      company TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL,
      jd_json TEXT NOT NULL,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      paste_count INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_jds_last_seen ON jds(last_seen);
  `);

  const stmt = {
    find: db.prepare('SELECT id FROM jds WHERE fingerprint = ?'),
    insert: db.prepare(
      `INSERT INTO jds (fingerprint, title, company, text, jd_json, first_seen, last_seen, paste_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    ),
    touch: db.prepare(
      'UPDATE jds SET last_seen = ?, paste_count = paste_count + 1, text = ?, jd_json = ? WHERE id = ?',
    ),
    list: db.prepare('SELECT * FROM jds WHERE last_seen >= ? ORDER BY last_seen DESC LIMIT ?'),
    all: db.prepare('SELECT * FROM jds ORDER BY last_seen DESC LIMIT ?'),
    byId: db.prepare('SELECT * FROM jds WHERE id = ?'),
    count: db.prepare('SELECT COUNT(*) AS c FROM jds'),
  };

  return {
    /** 入库/更新。同一个 JD 再贴一次只更新 last_seen 与 paste_count。 */
    upsertJd({ text, jdJson, sourceUrl = '', now = new Date() }) {
      const safeText = scrubPii(text);
      const title = jdJson?.role_summary?.title ?? '';
      const company = (String(safeText).match(/(?:公司|企业)\s*[:：]\s*([^\n]{2,20})/)?.[1] ?? '').trim();
      const fp = fingerprint(title, company, safeText);
      const iso = now.toISOString();
      const found = stmt.find.get(fp);
      const payload = JSON.stringify(jdJson ?? {});
      if (found) {
        stmt.touch.run(iso, safeText, payload, found.id);
        return { id: found.id, created: false };
      }
      stmt.insert.run(fp, title, company, safeText, payload, iso, iso);
      return { id: Number(stmt.find.get(fp).id), created: true };
    },

    /** 时效内（默认 30 天）的岗位，按最近出现时间倒序 */
    listActive({ days = 30, limit = 200, now = new Date() } = {}) {
      const cutoff = new Date(now.getTime() - days * 86400000).toISOString();
      return stmt.list.all(cutoff, limit);
    },

    listAll({ limit = 200 } = {}) {
      return stmt.all.all(limit);
    },

    getById(id) {
      return stmt.byId.get(id);
    },

    count() {
      return Number(stmt.count.get().c);
    },

    close() {
      db.close();
    },
  };
}
