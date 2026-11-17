import { isCSSRequest, mergeConfig } from 'vite';
import appConfig from '../vite.config';

// The entry response alone does not mean Vite has transformed its static imports.
// Keep cold compilation in web-server readiness, before scenario timers start.
export default mergeConfig(appConfig, {
  optimizeDeps: {
    // mergeConfig retains index.html from appConfig. Include the lazy cabinet
    // entry in the initial browser dependency scan, before readiness traversal.
    entries: ['src/app/routes/CabinetRouteContainer.tsx'],
  },
  plugins: [
    {
      name: 'e2e-cabinet-readiness',
      configureServer(server) {
        let ready: Promise<void> | undefined;
        server.middlewares.use('/__e2e/cabinet-ready', (_request, response, next) => {
          ready ??= (async () => {
            // Vite's idle promise is one-shot and may already be resolved.
            // Await browser imports, including literal lazy imports. CSS graph
            // edges also contain Tailwind addWatchFile sources/globs: those are
            // HMR dependencies, not browser imports. Transform CSS as a leaf.
            // Visit each URL once so cycles cannot deadlock.
            const visited = new Set<string>();
            const warmModule = async (url: string): Promise<void> => {
              if (visited.has(url)) return;
              visited.add(url);
              await server.transformRequest(url);
              const module = await server.environments.client.moduleGraph.getModuleByUrl(url);
              if (!module) throw new Error(`Missing E2E cabinet module: ${url}`);
              if (isCSSRequest(url)) return;
              await Promise.all(
                [...module.importedModules].map((dependency) => warmModule(dependency.url))
              );
            };
            await warmModule('/src/app/routes/CabinetRouteContainer.tsx');
          })();
          void ready.then(
            () => {
              response.statusCode = 204;
              response.end();
            },
            next
          );
        });
      },
    },
  ],
});
