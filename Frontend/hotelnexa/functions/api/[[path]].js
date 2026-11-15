export async function onRequest({ request, env }) {
  if (!env.API_ORIGIN) {
    return new Response("API_ORIGIN is not configured.", { status: 500 });
  }

  const apiOrigin = new URL(env.API_ORIGIN);
  if (apiOrigin.protocol !== "https:") {
    return new Response("API_ORIGIN must use HTTPS.", { status: 500 });
  }

  const requestUrl = new URL(request.url);
  const targetUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, apiOrigin);

  return fetch(new Request(targetUrl, request), { redirect: "manual" });
}
