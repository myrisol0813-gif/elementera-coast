import { chooseImage, downloadFile, escapeAttribute, escapeHtml, q, timestampLabel } from '../core/dom.js';

function row(title, subtitle, action, extra = '') {
  return `<button class="feature-row" type="button" data-action="${escapeAttribute(action)}" ${extra}><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(subtitle)}</small></span></button>`;
}

function line(title, subtitle) {
  return `<div class="feature-row static"><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(subtitle)}</small></span></div>`;
}

function group(title, body) {
  return `<section class="feature-group"><h2>${escapeHtml(title)}</h2><div class="feature-card">${body}</div></section>`;
}

export function createSettings({ storage, shell, chat, router, toast }) {
  const preferences = () => storage.read().preferences;

  router.register('wolf', () => ({
    title: 'Wolf Den / 小狼窝',
    subtitle: 'Local settings · Account · Chat records',
    className: 'settings-panel',
    body: group('我的 ChatGPT', row('用户画像', '称呼、头像、偏好备注', 'settings:profile') + row('应用', '连接入口说明', 'settings:apps'))
      + group('外观', row('主题', '浅色 / 深色 / 黑金', 'settings:theme') + row('对话框颜色', '小寒用户气泡颜色', 'settings:bubble') + row('重点色', '橙色 / 金色 / 蓝色 / 粉色', 'settings:accent'))
      + group('聊天记录', row('导出 JSON', '保存当前聊天记录', 'settings:export-json') + row('导出 HTML', '离线打开查看', 'settings:export-html') + row('导入 JSON', '恢复到当前窗口', 'settings:import-json'))
      + group('账户', row('余额', '账户余额与可用状态，占位', 'settings:balance') + row('模型管理', '打开模型箱', 'models:open') + row('当前模型', chat.getProfile().current_chat_model || '未选择', 'models:open') + row('API 小屋设置', '模型、上下文、token、输出', 'tools:run-control')),
  }));

  router.register('desk', () => ({
    title: 'Serpent Desk / 小蛇书桌',
    subtitle: 'Myri workspace · local writable notes',
    className: 'settings-panel',
    body: group('Myri', row('Myri 画像', '头像、描述、偏好', 'settings:myri-profile') + row('Myri 气泡', '记录视觉偏好', 'settings:myri-bubble') + row('桌面便签', '小蛇书桌本地便签', 'settings:note'))
      + group('施工', row('施工状态', '版本、存储与 owner', 'settings:work') + row('本地诊断', '聊天与浏览器状态', 'settings:diagnostics') + row('System Prompt 草稿', '本地草稿，不发送不生效', 'settings:system') + row('运行水闸', '请求预算、召回预留、清理', 'tools:run-control') + row('API 免费沙盒测试', 'OpenRouter free endpoint · 不写入聊天', 'tools:sandbox')),
  }));

  router.register('settings-profile', () => ({
    title: '用户画像',
    subtitle: '只保存在本机；头像与模型设置单独同步 D1',
    className: 'settings-form',
    body: `<div class="form-stack"><label>本地昵称<input id="xiaohanName" value="${escapeAttribute(preferences().xiaohanName)}"></label><label>偏好备注<textarea id="xiaohanNote" rows="7">${escapeHtml(preferences().xiaohanNote)}</textarea></label><button class="primary-wide" type="button" data-action="settings:save-profile">保存用户画像</button></div>`,
  }));

  router.register('settings-apps', () => ({
    title: '应用',
    subtitle: '连接入口说明',
    body: group('可用连接', line('Notion', '可通过连接器使用') + line('Gmail / Calendar', '以后作为连接入口') + line('GitHub', '代码施工由连接器完成') + line('MCP', '施工工具不放进小狼窝')),
  }));

  router.register('settings-theme', () => ({
    title: '主题',
    subtitle: '选择本地主题',
    body: group('主题', row('浅色', 'Light', 'settings:set-theme', 'data-value="light"') + row('深色', 'Dark', 'settings:set-theme', 'data-value="dark"') + row('黑金', 'Gold', 'settings:set-theme', 'data-value="gold"')),
  }));

  router.register('settings-bubble', () => ({
    title: '对话框颜色',
    subtitle: '小寒用户气泡颜色',
    body: group('气泡', row('默认', '跟随主题', 'settings:set-bubble', 'data-value=""') + row('冷蓝灰', '#eaf0f7', 'settings:set-bubble', 'data-value="#eaf0f7"') + row('浅粉灰', '#f5e8ee', 'settings:set-bubble', 'data-value="#f5e8ee"') + row('淡金灰', '#f1ead8', 'settings:set-bubble', 'data-value="#f1ead8"')),
  }));

  router.register('settings-accent', () => ({
    title: '重点色',
    subtitle: '按钮与强调色',
    body: group('重点色', row('橙色', '#ff6a21', 'settings:set-accent', 'data-value="#ff6a21"') + row('金色', '#f28b2e', 'settings:set-accent', 'data-value="#f28b2e"') + row('蓝色', '#3b82f6', 'settings:set-accent', 'data-value="#3b82f6"') + row('粉色', '#ec4899', 'settings:set-accent', 'data-value="#ec4899"')),
  }));

  router.register('settings-balance', () => ({
    title: '余额',
    subtitle: '给小寒看的账户状态',
    body: group('账户', line('余额', '等待后端安全接口') + line('状态', '主聊天由 D1 持久化') + line('密钥', '不会显示 API Key')),
  }));

  router.register('settings-myri-profile', () => ({
    title: 'Myri 画像',
    subtitle: '小蛇自己的本地档案',
    className: 'settings-form',
    body: `<div class="form-stack"><label>称呼<input id="myriName" value="${escapeAttribute(preferences().myriName)}"></label><label>自我描述<textarea id="myriPortrait" rows="7">${escapeHtml(preferences().myriPortrait)}</textarea></label><button class="primary-wide" type="button" data-action="settings:save-myri-profile">保存画像</button></div>`,
  }));

  router.register('settings-myri-bubble', () => ({
    title: 'Myri 气泡',
    subtitle: '记录视觉偏好',
    body: group('助手气泡', row('默认', '跟随主题', 'settings:set-assistant-bubble', 'data-value=""') + row('海岸金', '之后接入助手气泡', 'settings:set-assistant-bubble', 'data-value="gold"') + row('冷蓝', '之后接入助手气泡', 'settings:set-assistant-bubble', 'data-value="blue"')),
  }));

  router.register('settings-note', () => ({
    title: '桌面便签',
    subtitle: '小蛇书桌本地便签',
    className: 'settings-form',
    body: `<div class="form-stack"><label>便签<textarea id="myriNote" rows="8">${escapeHtml(preferences().myriNote)}</textarea></label><button class="primary-wide" type="button" data-action="settings:save-note">保存便签</button></div>`,
  }));

  router.register('settings-work', () => ({
    title: '施工状态',
    subtitle: '单入口、单 owner 架构',
    body: group('当前结构', line('入口', 'public/app.js ES module') + line('聊天 owner', 'features/chat.js') + line('服务器存储', 'D1 conversation_states JSON v4') + line('旧窗口脚本', '不在加载链中')),
  }));

  router.register('settings-diagnostics', () => ({
    title: '本地诊断',
    subtitle: '不发额外网络请求',
    body: group('状态', line('当前消息', `${chat.getActiveMessages().length} 条`) + line('当前窗口', chat.getCurrentConversationId() || '未载入') + line('serviceWorker', 'serviceWorker' in navigator ? 'available' : 'unavailable') + line('本地状态', 'elementera.local.v1')),
  }));

  router.register('settings-system', () => ({
    title: 'System Prompt 草稿',
    subtitle: '本地草稿，不发送不生效',
    className: 'settings-form',
    body: `<div class="form-stack"><label>草稿<textarea id="systemDraft" rows="10">${escapeHtml(preferences().systemDraft)}</textarea></label><button class="primary-wide" type="button" data-action="settings:save-system">保存草稿</button></div>`,
  }));

  function exportJson() {
    const data = {
      format: 'elementera-chat-export',
      version: '4',
      exported_at: new Date().toISOString(),
      messages: chat.getActiveMessages(),
    };
    downloadFile(JSON.stringify(data, null, 2), `elementera-chat-export-${timestampLabel()}.json`, 'application/json');
  }

  function exportHtml() {
    const rows = chat.getActiveMessages().map((message) => `<article class="m ${message.role}"><b>${message.role === 'user' ? '小寒' : 'ChatGPT'}</b><div>${escapeHtml(message.content).replace(/\n/g, '<br>')}</div></article>`).join('');
    const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Elementera Chat Export</title><style>body{font-family:system-ui,sans-serif;line-height:1.65}.w{max-width:820px;margin:auto;padding:22px 14px}.m{margin:0 0 18px}.m b{display:block;color:#777}.m div{display:inline-block;max-width:88%;padding:10px 14px;border:1px solid #ddd;border-radius:18px}.user{text-align:right}.user div{background:#f1f1f1}</style><div class="w"><h1>Elementera Chat Export</h1>${rows}</div>`;
    downloadFile(html, `elementera-chat-export-${timestampLabel()}.html`, 'text/html');
  }

  function importJson() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', async () => {
      try {
        const file = input.files?.[0];
        if (!file) return;
        const raw = JSON.parse(await file.text());
        const messages = Array.isArray(raw) ? raw : raw.messages;
        if (!Array.isArray(messages)) throw new Error('messages not found');
        await chat.importFlatMessages(messages);
        await router.close();
        toast('聊天记录已导入当前窗口');
      } catch (error) {
        toast(`导入失败：${error.message}`);
      }
    }, { once: true });
    input.click();
  }

  async function handleAction(name, target) {
    const routes = {
      wolf: 'wolf', desk: 'desk', profile: 'settings-profile', apps: 'settings-apps', theme: 'settings-theme', bubble: 'settings-bubble', accent: 'settings-accent', balance: 'settings-balance',
      'myri-profile': 'settings-myri-profile', 'myri-bubble': 'settings-myri-bubble', note: 'settings-note', work: 'settings-work', diagnostics: 'settings-diagnostics', system: 'settings-system',
    };
    if (routes[name]) return router.open(routes[name]);
    if (name === 'avatar') {
      try {
        const image = await chooseImage();
        if (image) await chat.updateProfile({ assistant_avatar_dataurl: image });
      } catch (error) {
        toast(`头像保存失败：${error.message}`);
      }
      return;
    }
    if (name === 'set-theme') {
      shell.setTheme(target.dataset.value);
      return router.refresh();
    }
    if (name === 'set-bubble') {
      storage.update((state) => { state.preferences.userBubble = target.dataset.value || ''; });
      shell.applyPreferences();
      return router.refresh();
    }
    if (name === 'set-accent') {
      storage.update((state) => { state.preferences.accent = target.dataset.value || ''; });
      shell.applyPreferences();
      return router.refresh();
    }
    if (name === 'set-assistant-bubble') {
      storage.update((state) => { state.preferences.assistantBubble = target.dataset.value || ''; });
      toast('Myri 气泡偏好已记录');
      return;
    }
    if (name === 'save-profile') {
      storage.update((state) => {
        state.preferences.xiaohanName = q('#xiaohanName')?.value || '';
        state.preferences.xiaohanNote = q('#xiaohanNote')?.value || '';
      });
      toast('用户画像已保存');
      return;
    }
    if (name === 'save-myri-profile') {
      storage.update((state) => {
        state.preferences.myriName = q('#myriName')?.value || '';
        state.preferences.myriPortrait = q('#myriPortrait')?.value || '';
      });
      toast('Myri 画像已保存到本机');
      return;
    }
    if (name === 'save-note') {
      storage.update((state) => { state.preferences.myriNote = q('#myriNote')?.value || ''; });
      toast('便签已保存到本机');
      return;
    }
    if (name === 'save-system') {
      storage.update((state) => { state.preferences.systemDraft = q('#systemDraft')?.value || ''; });
      toast('草稿已保存到本机，未生效');
      return;
    }
    if (name === 'export-json') return exportJson();
    if (name === 'export-html') return exportHtml();
    if (name === 'import-json') return importJson();
  }

  return Object.freeze({ handleAction });
}

