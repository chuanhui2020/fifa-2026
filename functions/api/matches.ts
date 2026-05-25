interface Env {
  FIFA_MATCHES: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const data = await context.env.FIFA_MATCHES.get("matches:all");
  const lastUpdated = await context.env.FIFA_MATCHES.get("meta:lastUpdated");

  const matches = data ? JSON.parse(data) : [];

  return new Response(JSON.stringify({ matches, lastUpdated }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, s-maxage=30, max-age=15",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
