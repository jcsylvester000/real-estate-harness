/*!
 * grid.js — Grid Agentic app SDK v0.1
 * Apps run inside a desktop window (an iframe). This SDK never holds the user's session: every call is a
 * postMessage to the desktop, which checks the app's permissions, asks the user when needed, and calls the
 * server on the app's behalf.
 *
 *   <script src="https://YOUR-GRID-HOST/sdk/grid.js"></script>
 *   await grid.ready;
 *   const turn = await grid.ai.chat("Cost to buy a ₱7.6M condo in Pasig?");
 */
(function () {
  "use strict";
  if (window.grid && window.grid.__sdk) return;

  var PROTOCOL = 1;
  var DEFAULT_TIMEOUT = 30000;
  var LONG_TIMEOUT = 95000; // AI turns can run several model and tool steps
  var embedded = window.parent && window.parent !== window;
  var seq = 0;
  var pending = {};
  var listeners = {};
  var resolveReady, rejectReady;
  var ready = new Promise(function (res, rej) {
    resolveReady = res;
    rejectReady = rej;
  });

  function GridError(code, message) {
    var e = new Error(message || code);
    e.name = "GridError";
    e.code = code;
    return e;
  }

  function post(msg) {
    msg.__grid = PROTOCOL;
    // The desktop identifies the sender by its window object, not by anything in the message.
    window.parent.postMessage(msg, "*");
  }

  function request(method, params, timeoutMs) {
    if (!embedded) return Promise.reject(GridError("not_embedded", "Open this app from the Grid Agentic desktop."));
    return ready.then(function () {
      return new Promise(function (resolve, reject) {
        var id = "r" + ++seq;
        var timer = setTimeout(function () {
          delete pending[id];
          reject(GridError("timeout", "The desktop did not answer in time."));
        }, timeoutMs || DEFAULT_TIMEOUT);
        pending[id] = { resolve: resolve, reject: reject, timer: timer };
        post({ type: "req", id: id, method: method, params: params || {} });
      });
    });
  }

  function emit(name, data) {
    (listeners[name] || []).slice().forEach(function (fn) {
      try {
        fn(data);
      } catch (e) {
        console.error("[grid] listener for " + name + " failed", e);
      }
    });
  }

  window.addEventListener("message", function (ev) {
    if (ev.source !== window.parent) return;
    var d = ev.data;
    if (!d || d.__grid !== PROTOCOL) return;
    if (d.type === "welcome") {
      grid.appId = d.appId;
      grid.appName = d.appName;
      grid.launchArgs = d.launchArgs || {};
      grid.user = d.user || null;
      grid.ai.available = !!(d.ai && d.ai.realAi);
      document.documentElement.dataset.gridTheme = d.theme || "light";
      resolveReady(grid);
    } else if (d.type === "res" && pending[d.id]) {
      var p = pending[d.id];
      delete pending[d.id];
      clearTimeout(p.timer);
      if (d.ok) p.resolve(d.result);
      else p.reject(GridError((d.error && d.error.code) || "error", d.error && d.error.message));
    } else if (d.type === "event") {
      emit(d.name, d.data);
    }
  });

  var c = function (method, timeout) {
    return function (params) {
      return request(method, params, timeout);
    };
  };

  var grid = {
    __sdk: true,
    version: "0.1.0",
    ready: ready,
    appId: null,
    launchArgs: {},
    user: null,
    /** Low-level: call any driver method by name. */
    call: request,
    on: function (name, fn) {
      (listeners[name] = listeners[name] || []).push(fn);
      return function () {
        listeners[name] = (listeners[name] || []).filter(function (f) {
          return f !== fn;
        });
      };
    },

    auth: { whoami: c("auth.whoami") },

    ai: {
      /** True when the server has a real AI key; false means Smart search mode (calculators + index, no free chat). */
      available: false,
      status: c("ai.status"),
      /** One harness turn: reply, tool trace, tokens, cost (US$ and ₱), warnings. */
      chat: function (message, opts) {
        opts = opts || {};
        return request("ai.chat", { message: message, sessionId: opts.sessionId, provider: opts.provider, tier: opts.tier }, LONG_TIMEOUT);
      },
      providers: c("ai.providers"),
      sessions: c("ai.sessions"),
      session: function (sessionId) {
        return request("ai.session", { sessionId: sessionId });
      },
      deleteSession: function (sessionId) {
        return request("ai.deleteSession", { sessionId: sessionId });
      },
      /** Your own AI keys (Settings app only). Keys are write-only: list() shows the last 4 characters. */
      keys: {
        list: c("ai.keys.list"),
        save: c("ai.keys.save"),
        test: c("ai.keys.test", LONG_TIMEOUT),
        remove: function (id) {
          return request("ai.keys.remove", { id: id });
        },
        presets: c("ai.keys.presets"),
      },
    },

    tools: {
      list: c("tools.list"),
      /** Runs a harness calculator directly: no AI, no cost. */
      run: function (name, args) {
        return request("tools.run", { name: name, args: args || {} });
      },
    },

    listings: {
      search: c("listings.search"),
      /** Plain-language inquiry → filters + results, no AI: grid.listings.ask("2BR condo for rent in BGC under 60k") */
      ask: function (text, opts) {
        var o = opts || {};
        return request("listings.ask", { text: text, limit: o.limit, offset: o.offset, sort: o.sort });
      },
      facets: c("listings.facets"),
      import: function (fileName, csv) {
        return request("listings.import", { fileName: fileName, csv: csv }, 120000);
      },
      imports: c("listings.imports"),
      get: function (code) {
        return request("listings.get", { code: code });
      },
      save: c("listings.save"),
      delete: function (code) {
        return request("listings.delete", { code: code });
      },
    },

    fs: {
      list: function (path) {
        return request("fs.list", { path: path || "/" });
      },
      stat: function (path) {
        return request("fs.stat", { path: path });
      },
      read: function (path) {
        return request("fs.read", { path: path });
      },
      write: function (path, content, opts) {
        var o = opts || {};
        return request("fs.write", { path: path, content: content, encoding: o.encoding, mime: o.mime, overwrite: o.overwrite, createParents: o.createParents });
      },
      mkdir: function (path, opts) {
        return request("fs.mkdir", { path: path, createParents: !!(opts && opts.createParents) });
      },
      rename: function (from, to) {
        return request("fs.rename", { from: from, to: to });
      },
      delete: function (path) {
        return request("fs.delete", { path: path });
      },
    },

    /** Key-value storage private to this app and user. */
    kv: {
      get: function (key) {
        return request("kv.get", { key: key });
      },
      set: function (key, value) {
        return request("kv.set", { key: key, value: value });
      },
      del: function (key) {
        return request("kv.del", { key: key });
      },
      list: function (prefix) {
        return request("kv.list", { prefix: prefix });
      },
    },

    /** Documents the Query Engine can read. Extract text in the browser first (PDF, DOCX, OCR); only text is sent. */
    docs: {
      list: c("docs.list"),
      /** Text notes in Files (newest first): path, name, updatedAt, preview. */
      notes: c("docs.notes"),
      get: function (id, opts) {
        return request("docs.get", { id: id, withText: !!(opts && opts.withText) });
      },
      search: function (q, opts) {
        return request("docs.search", { q: q, limit: opts && opts.limit });
      },
      add: c("docs.add"),
      delete: function (id) {
        return request("docs.delete", { id: id });
      },
    },

    /** Property Teaser: decks and trailers, images (upload, web search, link import), Polish with AI. */
    teaser: {
      list: c("teaser.list"),
      get: function (id) {
        return request("teaser.get", { id: id });
      },
      save: c("teaser.save"),
      delete: function (id) {
        return request("teaser.delete", { id: id });
      },
      duplicate: function (id) {
        return request("teaser.duplicate", { id: id });
      },
      templates: c("teaser.templates"),
      getTemplate: function (id) {
        return request("teaser.getTemplate", { id: id });
      },
      saveTemplate: c("teaser.saveTemplate"),
      deleteTemplate: function (id) {
        return request("teaser.deleteTemplate", { id: id });
      },
      assets: function (source) {
        return request("teaser.assets", { source: source });
      },
      addAsset: c("teaser.addAsset", LONG_TIMEOUT),
      deleteAsset: function (id) {
        return request("teaser.deleteAsset", { id: id });
      },
      searchWeb: function (q, page) {
        return request("teaser.searchWeb", { q: q, page: page }, LONG_TIMEOUT);
      },
      importUrl: c("teaser.importUrl", LONG_TIMEOUT),
      polish: c("teaser.polish", LONG_TIMEOUT),
    },

    /** Home-loan lenders (Pag-IBIG, banks, in-house): rates, comparison, rate edits. */
    lenders: {
      list: c("lenders.list"),
      compare: c("lenders.compare"),
      save: c("lenders.save"),
      reset: function (id) {
        return request("lenders.reset", { id: id });
      },
    },
    /** Buyer–Seller Matching: live scoring, saved buyers, two-way matches. */
    match: {
      run: function (criteria, opts) {
        var o = opts || {};
        return request("match.run", { criteria: criteria, limit: o.limit, offset: o.offset });
      },
      buyers: c("match.buyers"),
      saveBuyer: c("match.saveBuyer"),
      deleteBuyer: function (id) {
        return request("match.deleteBuyer", { id: id });
      },
      buyerMatches: function (id, opts) {
        var o = opts || {};
        return request("match.buyerMatches", { id: id, limit: o.limit, offset: o.offset });
      },
      listingBuyers: function (code) {
        return request("match.listingBuyers", { code: code });
      },
    },
    usage: { mine: c("usage.mine"), all: c("usage.all") },
    apps: {
      list: c("apps.list"),
      install: c("apps.install"),
      uninstall: function (appId) {
        return request("apps.uninstall", { appId: appId });
      },
      grants: c("apps.grants"),
      revoke: function (appId, permission) {
        return request("apps.revoke", { appId: appId, permission: permission });
      },
    },
    users: { list: c("users.list"), create: c("users.create"), update: c("users.update"), resetPassword: c("users.resetPassword") },
    account: { update: c("account.update"), changePassword: c("account.changePassword") },

    /** Desktop UI: dialogs, notifications and window control. */
    ui: {
      alert: function (message, opts) {
        return request("ui.alert", { message: String(message), title: opts && opts.title }, 600000);
      },
      confirm: function (message, opts) {
        return request("ui.confirm", { message: String(message), title: opts && opts.title, okLabel: opts && opts.okLabel, danger: !!(opts && opts.danger) }, 600000);
      },
      prompt: function (message, defaultValue, opts) {
        return request("ui.prompt", { message: String(message), defaultValue: defaultValue || "", title: opts && opts.title }, 600000);
      },
      notify: function (message, opts) {
        return request("ui.notify", { message: String(message), tone: (opts && opts.tone) || "info" });
      },
      setTitle: function (title) {
        return request("ui.setTitle", { title: String(title) });
      },
      openApp: function (appId, args) {
        return request("ui.openApp", { appId: appId, args: args || {} });
      },
      /** Opens a file in the app registered for its extension (e.g. Notes for .md). */
      openFile: function (path) {
        return request("ui.openFile", { path: path });
      },
      /** Lets the user choose one of their files; resolves to { path, name } or null. */
      pickFile: function (opts) {
        return request("ui.pickFile", { extensions: (opts && opts.extensions) || [] }, 600000);
      },
      close: function () {
        return request("ui.close", {});
      },
    },
  };

  window.grid = grid;
  if (embedded) {
    var hello = function () {
      post({ type: "hello" });
    };
    hello();
    // The desktop may attach its listener a moment after the frame loads; say hello again until welcomed.
    var tries = 0;
    var timer = setInterval(function () {
      if (grid.appId || ++tries > 20) {
        clearInterval(timer);
        if (!grid.appId) rejectReady(GridError("no_desktop", "Could not reach the Grid Agentic desktop."));
        return;
      }
      hello();
    }, 250);
  } else {
    rejectReady(GridError("not_embedded", "Open this app from the Grid Agentic desktop."));
  }
  ready.catch(function () {});
})();
