const mount = document.querySelector('#app');

function renderAppV2() {
  if (!mount) return;

  mount.innerHTML = `
    <div class="ec-v2-shell">
      <header class="ec-v2-topbar">
        <button class="ec-v2-icon-button" type="button" aria-label="侧边栏占位">☰</button>
        <div class="ec-v2-title-block">
          <strong>Elementera Coast v2</strong>
          <span>模块化空壳 · P3-REF-01A</span>
        </div>
        <button class="ec-v2-icon-button" type="button" aria-label="更多占位">⋯</button>
      </header>

      <main class="ec-v2-main" aria-label="app-v2 空壳消息区">
        <section class="ec-v2-empty-state">
          <h1>app-v2 空壳已启动</h1>
          <p>这里仅用于验证模块入口、顶部栏、消息区和底部输入栏位置。</p>
        </section>
      </main>

      <form class="ec-v2-composer" aria-label="app-v2 输入栏占位">
        <button class="ec-v2-add-button" type="button" aria-label="附件占位">+</button>
        <textarea
          rows="1"
          placeholder="v2 壳测试中，暂不发送"
          aria-label="v2 壳测试中，暂不发送"
          disabled
        ></textarea>
        <button class="ec-v2-send-button" type="button" aria-label="发送占位" disabled>↑</button>
      </form>
    </div>
  `;
}

renderAppV2();
