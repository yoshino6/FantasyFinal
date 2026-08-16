import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { requireAdministrator } from './permission.service';

type Scope = 'personal' | 'global';
type EditRow = RowDataPacket & { id: number; recipient_scope: Scope; title: string; content: string; status: 'editing' | 'draft' };
type RecipientRow = RowDataPacket & { qq_user_id: string; nickname: string };
type AttachmentRow = RowDataPacket & { item_id: number; name: string; quantity: number };
type ItemRow = RowDataPacket & { id: number; name: string };
type Connection = PoolConnection | Awaited<ReturnType<typeof getPool>>;

export type MailEdit = { scope: Scope; status: 'editing' | 'draft'; title: string; content: string; recipients: Array<{ qqUserId: string; nickname: string }>; attachments: Array<{ itemId: number; name: string; quantity: number }> };

const validQuantity = (quantity: number) => {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999999) throw new Error('数量必须是 1 至 999999 之间的整数。');
  return quantity;
};

const editRow = async (connection: Connection, adminQqUserId: string, lock = false) => {
  const [rows] = await connection.execute<EditRow[]>(`SELECT id,recipient_scope,title,content,status FROM admin_mail_edits WHERE admin_qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [adminQqUserId]);
  return rows[0] ?? null;
};

const loadEdit = async (connection: Connection, edit: EditRow): Promise<MailEdit> => {
  const [recipients] = await connection.execute<RecipientRow[]>('SELECT qq_user_id,nickname FROM admin_mail_edit_recipients WHERE edit_id=? ORDER BY qq_user_id', [edit.id]);
  const [attachments] = await connection.execute<AttachmentRow[]>('SELECT a.item_id,i.name,a.quantity FROM admin_mail_edit_attachments a JOIN item_definitions i ON i.id=a.item_id WHERE a.edit_id=? ORDER BY a.item_id', [edit.id]);
  return { scope: edit.recipient_scope, status: edit.status, title: edit.title, content: edit.content, recipients: recipients.map(row => ({ qqUserId: row.qq_user_id, nickname: row.nickname })), attachments: attachments.map(row => ({ itemId: Number(row.item_id), name: row.name, quantity: Number(row.quantity) })) };
};

const requireEdit = async (connection: Connection, adminQqUserId: string, lock = true) => {
  const edit = await editRow(connection, adminQqUserId, lock);
  if (!edit || edit.status !== 'editing') throw new Error('当前没有正在编辑的邮件。');
  return edit;
};

const recipientForQq = async (connection: Connection, qqUserId: string) => {
  const [rows] = await connection.execute<(RowDataPacket & { qq_user_id: string; name: string })[]>('SELECT p.qq_user_id,c.name FROM players p JOIN characters c ON c.player_id=p.id WHERE p.qq_user_id=? LIMIT 1', [qqUserId]);
  if (!rows[0]) throw new Error('该玩家尚未注册角色，无法添加为邮件接收人。');
  return rows[0];
};

const recipientForName = async (connection: Connection, name: string) => {
  const [rows] = await connection.execute<(RowDataPacket & { qq_user_id: string; name: string })[]>('SELECT p.qq_user_id,c.name FROM players p JOIN characters c ON c.player_id=p.id WHERE c.name=? OR p.qq_nickname=? LIMIT 1', [name, name]);
  if (!rows[0]) throw new Error('没有找到已注册的同名玩家。');
  return rows[0];
};

const itemFor = async (connection: Connection, key: string) => {
  const numericId = /^\d+$/.test(key) ? Number(key) : 0;
  const [rows] = await connection.execute<ItemRow[]>('SELECT id,name FROM item_definitions WHERE id=? OR code=? OR codex_id=? OR name=? LIMIT 1', [numericId, key, key, key]);
  if (!rows[0]) throw new Error('未找到该物品。');
  return rows[0];
};

const validateEdit = (edit: MailEdit) => {
  if (edit.scope === 'personal' && !edit.recipients.length) throw new Error('请至少添加一名接收人。');
  if (!edit.title.trim()) throw new Error('请先编辑邮件标题。');
};

export const activeMailEdit = async (adminQqUserId: string) => {
  const pool = await getPool(); const edit = await editRow(pool, adminQqUserId);
  return edit?.status === 'editing';
};

export const openMailEdit = async (adminQqUserId: string, scope: Scope) => withTransaction(async connection => {
  await requireAdministrator(adminQqUserId, connection);
  let edit = await editRow(connection, adminQqUserId, true);
  if (!edit) {
    const [result] = await connection.execute<ResultSetHeader>('INSERT INTO admin_mail_edits (admin_qq_user_id,recipient_scope,title,content) VALUES (?,?,?,?)', [adminQqUserId, scope, '', '']);
    edit = { id: Number(result.insertId), recipient_scope: scope, title: '', content: '', status: 'editing' } as EditRow;
  } else {
    await connection.execute("UPDATE admin_mail_edits SET recipient_scope=?,status='editing' WHERE id=?", [scope, edit.id]);
    edit.recipient_scope = scope;
    edit.status = 'editing';
  }
  return loadEdit(connection, edit);
});

export const switchMailEditToGlobal = async (adminQqUserId: string) => withTransaction(async connection => {
  await requireAdministrator(adminQqUserId, connection);
  const edit = await requireEdit(connection, adminQqUserId);
  if (edit.recipient_scope === 'personal') {
    await connection.execute("UPDATE admin_mail_edits SET recipient_scope='global' WHERE id=?", [edit.id]);
    await connection.execute('DELETE FROM admin_mail_edit_recipients WHERE edit_id=?', [edit.id]);
    edit.recipient_scope = 'global';
  }
  return loadEdit(connection, edit);
});

export const getMailEdit = async (adminQqUserId: string) => {
  const pool = await getPool(); const edit = await editRow(pool, adminQqUserId);
  if (!edit) throw new Error('没有可继续的邮件编辑。');
  return loadEdit(pool, edit);
};

export const addMailRecipientByQq = async (adminQqUserId: string, targetQqUserId: string) => withTransaction(async connection => {
  await requireAdministrator(adminQqUserId, connection); const edit = await requireEdit(connection, adminQqUserId);
  if (edit.recipient_scope !== 'personal') throw new Error('全服发放无需添加个人接收人。');
  const recipient = await recipientForQq(connection, targetQqUserId);
  await connection.execute('INSERT IGNORE INTO admin_mail_edit_recipients (edit_id,qq_user_id,nickname) VALUES (?,?,?)', [edit.id, recipient.qq_user_id, recipient.name]);
  return loadEdit(connection, edit);
});

export const addMailRecipientByName = async (adminQqUserId: string, name: string) => withTransaction(async connection => {
  await requireAdministrator(adminQqUserId, connection); const edit = await requireEdit(connection, adminQqUserId);
  if (edit.recipient_scope !== 'personal') throw new Error('全服发放无需添加个人接收人。');
  const recipient = await recipientForName(connection, name.trim());
  await connection.execute('INSERT IGNORE INTO admin_mail_edit_recipients (edit_id,qq_user_id,nickname) VALUES (?,?,?)', [edit.id, recipient.qq_user_id, recipient.name]);
  return loadEdit(connection, edit);
});

export const removeMailRecipient = async (adminQqUserId: string, targetQqUserId: string) => withTransaction(async connection => {
  await requireAdministrator(adminQqUserId, connection); const edit = await requireEdit(connection, adminQqUserId);
  await connection.execute('DELETE FROM admin_mail_edit_recipients WHERE edit_id=? AND qq_user_id=?', [edit.id, targetQqUserId]);
  return loadEdit(connection, edit);
});

export const updateMailContent = async (adminQqUserId: string, content: string) => withTransaction(async connection => {
  await requireAdministrator(adminQqUserId, connection); const edit = await requireEdit(connection, adminQqUserId);
  const text = content.trim(); if (text.length > 2000) throw new Error('邮件内容不能超过 2000 字。');
  await connection.execute('UPDATE admin_mail_edits SET content=? WHERE id=?', [text, edit.id]); edit.content = text;
  return loadEdit(connection, edit);
});

export const updateMailTitle = async (adminQqUserId: string, title: string) => withTransaction(async connection => {
  await requireAdministrator(adminQqUserId, connection); const edit = await requireEdit(connection, adminQqUserId);
  const text = title.trim(); if (text.length > 96) throw new Error('邮件标题不能超过 96 字。');
  await connection.execute('UPDATE admin_mail_edits SET title=? WHERE id=?', [text, edit.id]); edit.title = text;
  return loadEdit(connection, edit);
});

export const addMailAttachment = async (adminQqUserId: string, itemKey: string, quantity: number) => withTransaction(async connection => {
  await requireAdministrator(adminQqUserId, connection); const edit = await requireEdit(connection, adminQqUserId); const item = await itemFor(connection, itemKey); const amount = validQuantity(quantity);
  await connection.execute('INSERT INTO admin_mail_edit_attachments (edit_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)', [edit.id, item.id, amount]);
  return loadEdit(connection, edit);
});

export const updateMailAttachmentQuantity = async (adminQqUserId: string, itemId: number, quantity: number) => withTransaction(async connection => {
  await requireAdministrator(adminQqUserId, connection); const edit = await requireEdit(connection, adminQqUserId); const amount = validQuantity(quantity);
  const [result] = await connection.execute<ResultSetHeader>('UPDATE admin_mail_edit_attachments SET quantity=? WHERE edit_id=? AND item_id=?', [amount, edit.id, itemId]);
  if (!result.affectedRows) throw new Error('该附件不在当前邮件中。');
  return loadEdit(connection, edit);
});

export const removeMailAttachment = async (adminQqUserId: string, itemId: number) => withTransaction(async connection => {
  await requireAdministrator(adminQqUserId, connection); const edit = await requireEdit(connection, adminQqUserId);
  await connection.execute('DELETE FROM admin_mail_edit_attachments WHERE edit_id=? AND item_id=?', [edit.id, itemId]);
  return loadEdit(connection, edit);
});

export const stashMailEdit = async (adminQqUserId: string) => withTransaction(async connection => {
  await requireAdministrator(adminQqUserId, connection); const edit = await requireEdit(connection, adminQqUserId);
  await connection.execute("UPDATE admin_mail_edits SET status='draft' WHERE id=?", [edit.id]);
});

export const discardMailEdit = async (adminQqUserId: string) => withTransaction(async connection => {
  await requireAdministrator(adminQqUserId, connection); const edit = await editRow(connection, adminQqUserId, true);
  if (!edit) throw new Error('当前没有可退出的邮件编辑。');
  await connection.execute('DELETE FROM admin_mail_edits WHERE id=?', [edit.id]);
});

export const previewMailEdit = async (adminQqUserId: string) => {
  const edit = await getMailEdit(adminQqUserId); if (edit.status !== 'editing') throw new Error('邮件已暂存，请先继续编辑。'); validateEdit(edit); return edit;
};

export const sendMailEdit = async (adminQqUserId: string) => withTransaction(async connection => {
  await requireAdministrator(adminQqUserId, connection); const edit = await requireEdit(connection, adminQqUserId); const data = await loadEdit(connection, edit); validateEdit(data);
  const targets = data.scope === 'global'
    ? (await connection.execute<(RowDataPacket & { id: number })[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id FOR UPDATE'))[0].map(row => Number(row.id))
    : (await connection.execute<(RowDataPacket & { id: number })[]>('SELECT c.id FROM admin_mail_edit_recipients r JOIN players p ON p.qq_user_id=r.qq_user_id JOIN characters c ON c.player_id=p.id WHERE r.edit_id=? FOR UPDATE', [edit.id]))[0].map(row => Number(row.id));
  if (!targets.length) throw new Error('当前没有可发放的已注册接收人。');
  for (const characterId of targets) {
    const [mail] = await connection.execute<ResultSetHeader>('INSERT INTO player_mails (character_id,title,content) VALUES (?,?,?)', [characterId, data.title, data.content]);
    for (const attachment of data.attachments) await connection.execute('INSERT INTO player_mail_attachments (mail_id,item_id,quantity) VALUES (?,?,?)', [mail.insertId, attachment.itemId, attachment.quantity]);
  }
  await connection.execute('DELETE FROM admin_mail_edits WHERE id=?', [edit.id]);
  return { recipientCount: targets.length, attachments: data.attachments };
});
