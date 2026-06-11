self.addEventListener("push", (event) => {
  let payload = {
    title: "Order update",
    body: "Your order status changed.",
    url: "/",
    tag: "order-update",
  };

  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch (error) {
      payload.body = event.data.text() || payload.body;
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/Garsone_Favicon.svg",
      badge: "/Garsone_Favicon.svg",
      tag: payload.tag,
      renotify: true,
      data: {
        url: payload.url || "/",
      },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(
    event.notification.data?.url || "/",
    self.location.origin
  ).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clientList) => {
        const sameOriginClient = clientList.find(
          (client) => new URL(client.url).origin === self.location.origin
        );

        if (sameOriginClient) {
          if ("navigate" in sameOriginClient) {
            const navigated = await sameOriginClient.navigate(targetUrl);
            return navigated?.focus();
          }
          return sameOriginClient.focus();
        }

        return self.clients.openWindow(targetUrl);
      })
  );
});
