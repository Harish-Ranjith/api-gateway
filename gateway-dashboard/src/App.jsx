import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

function App() {
  const [servers, setServers] = useState([]);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const es = new EventSource("http://localhost:8000/admin/stream");
    es.addEventListener("health", (e) => setServers(JSON.parse(e.data)));
    es.addEventListener("log", (e) =>
      setLogs((prev) => [JSON.parse(e.data), ...prev].slice(0, 50))
    );
    return () => es.close();
  }, []);

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Gateway</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Server health and traffic overview
          </p>
        </div>

        {/* Server Fleet */}
        <section className="mb-10">
          <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-4">
            Servers
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {servers.map((s, i) => (
              <Card key={i}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">
                      :{s.port}
                    </CardTitle>
                    <Badge
                      variant={s.isHealthy ? "secondary" : "destructive"}
                    >
                      {s.isHealthy ? "Healthy" : "Down"}
                    </Badge>
                  </div>
                  <CardDescription>{s.host}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <Separator />

        {/* Traffic Log */}
        <section className="mt-10">
          <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-4">
            Traffic
          </h2>
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[420px]">
                <div className="divide-y divide-border">
                  {logs.length === 0 && (
                    <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No traffic yet. Send a request to the gateway.
                    </p>
                  )}
                  {logs.map((log, i) => (
                    <div key={i} className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="font-mono text-xs">
                          {log.method}
                        </Badge>
                        <span className="font-medium truncate">{log.url}</span>
                        <span className="ml-auto text-muted-foreground tabular-nums">
                          {log.latency}ms
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>→ :{log.target}</span>
                        <span
                          className={
                            log.status === 200
                              ? "text-emerald-500"
                              : "text-destructive"
                          }
                        >
                          {log.status}
                        </span>
                        <span className="ml-auto font-mono truncate max-w-[180px]">
                          {log.traceId}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

export default App;
