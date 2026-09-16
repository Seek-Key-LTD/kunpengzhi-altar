import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import DirectorApp from './director/DirectorApp';
import './index.css';

// ── 路由：hash，不用 query ───────────────────────────────────────────
// v2 清单明令禁止 `?role=` 这类公共 query 裸露（会被缓存、被分享、被日志记下），
// 所以身份路由一律走 hash：`#/director` 进导演台，其余一律走公共入口 App。
// 零依赖：不引 react-router。

function currentRoute(): 'director' | 'public' {
  const first = window.location.hash.replace(/^#\/?/, '').split('/')[0];
  return first === 'director' ? 'director' : 'public';
}

const Root: React.FC = () => {
  const [route, setRoute] = React.useState(currentRoute);

  React.useEffect(() => {
    const onHashChange = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route === 'director' ? <DirectorApp /> : <App />;
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
