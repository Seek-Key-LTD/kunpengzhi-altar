import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import RelicViewer from './RelicViewer';
import './index.css';

// ── 路由：hash，不用 query ───────────────────────────────────────────
// v2 清单明令禁止 `?role=` 这类公共 query 裸露（会被缓存、被分享、被日志记下），
// 所以身份路由一律走 hash：`#/director` 进导演台，其余一律走公共入口 App。
// 零依赖：不引 react-router。
//
// #5 · 代码分割：导演路由**懒加载** —— 公共入口**不静态** import 任何导演/工程模块。
// 于是 vite/rollup 把 DirectorApp 及其依赖（Header/ControlsBar/SealPanel/…）拆成**独立 chunk**，
// 公共 index chunk 里读不到 `altar.director.confirmed` /「导演 / 认证台」等工程文案
// （访客 view-source 公共包也读不到）。`#/director` 行为不变，仅多一次按需拉取。
const DirectorApp = lazy(() => import('./director/DirectorApp'));

function currentRoute(): 'director' | 'public' {
  const first = window.location.hash.replace(/^#\/?/, '').split('/')[0];
  return first === 'director' ? 'director' : 'public';
}

const Root: React.FC = () => {
  if (window.location.pathname === '/relic-viewer') return <RelicViewer />;
  const [route, setRoute] = React.useState(currentRoute);

  React.useEffect(() => {
    const onHashChange = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (route !== 'director') return <App />;
  // 导演台按需加载；加载期间留白（公共侧体验与代码完全不受影响）。
  return (
    <Suspense fallback={null}>
      <DirectorApp />
    </Suspense>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
