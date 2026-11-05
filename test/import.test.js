import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { htmlToText, extractJdSection, fetchPage, isPrivateAddress } from '../src/fetcher.js';
import { docxXmlToText } from '../public/importers.js';

const HTML = `<!doctype html><html><head><title>AI 产品经理 - 某公司</title>
<script>var x=1;</script><style>.a{color:red}</style></head>
<body><nav>导航</nav>
<h1>AI 产品经理</h1>
<h2>岗位职责</h2>
<p>1. 负责 AI 应用产品规划；</p><p>2. 推动大模型能力落地。</p>
<h2>任职要求</h2>
<p>1. 本科及以上学历，3 年以上产品经验；</p>
<p>2. 熟悉 Prompt 工程。</p>
<div>公司介绍：我们是一家……</div>
<footer>© 2026</footer></body></html>`;

test('HTML 转文本：去掉脚本样式，块级标签转换行', () => {
  const text = htmlToText(HTML);
  assert.equal(text.includes('var x=1'), false);
  assert.equal(text.includes('color:red'), false);
  assert.ok(text.includes('岗位职责'));
  assert.ok(text.includes('任职要求'));
});

test('从整页里截出 JD 段，去掉公司介绍', () => {
  const text = extractJdSection(htmlToText(HTML));
  assert.ok(text.startsWith('岗位职责'));
  assert.ok(text.includes('熟悉 Prompt 工程'));
  assert.equal(text.includes('公司介绍'), false);
});

test('私网地址判定', () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.3.4', '192.168.1.1', '169.254.169.254', '::1', 'fd00::1']) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ['1.1.1.1', '8.8.8.8', '2001:4860:4860::8888']) {
    assert.equal(isPrivateAddress(ip), false, ip);
  }
});

test('SSRF：本机地址直接拒绝', async () => {
  await assert.rejects(() => fetchPage('http://127.0.0.1:3080/'), /内网或本机/);
});

test('只允许 http(s)', async () => {
  await assert.rejects(() => fetchPage('file:///C:/Windows/win.ini'), /http/);
});

async function withStub(handler, fn) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  try {
    return await fn(port);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('抓取页面并返回 JD 文本（测试用 allowPrivate 放行本机）', async () => {
  await withStub(
    (req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(HTML);
    },
    async (port) => {
      const result = await fetchPage(`http://127.0.0.1:${port}/job/1`, { allowPrivate: true });
      assert.equal(result.ok, true);
      assert.equal(result.title, 'AI 产品经理 - 某公司');
      assert.ok(result.text.includes('岗位职责'));
      assert.ok(result.text.length > 50);
    },
  );
});

test('登录墙 / 反爬：403 给出可操作提示', async () => {
  await withStub(
    (req, res) => {
      res.writeHead(403, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<html>security check</html>');
    },
    async (port) => {
      await assert.rejects(
        () => fetchPage(`http://127.0.0.1:${port}/`, { allowPrivate: true }),
        /需要登录或禁止抓取/,
      );
    },
  );
});

test('DOCX 正文 XML 转文本：段落换行、去标签、解实体', () => {
  const xml =
    '<w:document><w:body>' +
    '<w:p><w:r><w:t>负责客服工单系统</w:t></w:r><w:r><w:t xml:space="preserve">，覆盖 300 家企业</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t>提升 20%</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t>&amp; 其他</w:t></w:r></w:p>' +
    '</w:body></w:document>';
  const text = docxXmlToText(xml);
  assert.equal(text, '负责客服工单系统，覆盖 300 家企业\n提升 20%\n& 其他');
});
