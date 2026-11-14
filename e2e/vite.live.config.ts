import { mergeConfig } from 'vite';
import appConfig from '../vite.config';

// The entry response alone does not mean Vite has transformed its static imports.
// Keep cold compilation in web-server readiness, before scenario timers start.
export default mergeConfig(appConfig, {
  plugins: [
    {
      name: 'e2e-cabinet-readiness',
      configureServer(server) {
        let ready: Promise<void> | undefined;
        server.middlewares.use('/__e2e/cabinet-ready', (_request, response, next) => {
          ready ??= (async () => {
            // Vite's idle promise is one-shot and may already be resolved.
            // Explicitly await the route's dependency graph, including literal
            // lazy imports. Visit each URL once so cycles cannot deadlock.
            const visited = new Set<string>();
            const warmModule = async (url: string): Promise<void> => {
              if (visited.has(url)) return;
              visited.add(url);
              await server.transformRequest(url);
              const module = await server.moduleGraph.getModuleByUrl(url);
              if (!module) throw new Error(`Missing E2E cabinet module: ${url}`);
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
