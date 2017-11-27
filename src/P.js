"use strict";

// include _G.js begin

// the top object _G
(function() {
    if (typeof _G === "object" && _G !== null && _G === _G._G) {
        // already
        return;
    }

    var G = null;
    if (typeof window !== "undefined" && typeof navigator !== "undefined" && window.document) {
        G = window;
        G.vm = "browser";
    } else if (typeof process !== "undefined" && process.versions && process.versions.node) {
        G = global;
        G.vm = "node"
    }

    if (G) {
        Object.defineProperties(G, {
            // prefix underscore suggests it is a preset/internal variable
            _G: {
                value: G,
                configurable: false,
                enumerable: false,
                writable: false
            }
        });
    }
})();

// include end

// the object as module loader
(function(name) {
    if (typeof _G[name] !== "undefined") {
        throw "E: name conflict";
    }

    var current = _G[name] = {
        _name: name,
        _version: 870
    };

    // -----------------------------------------------------

    var isNull = function(o) {
        return o === undefined || o === null;
    };

    var isObject = function(o) {
        return typeof o === "object" && o !== null;
    };

    var _config = {
        path: {
        },
        add: function(c) {
            if (!isObject(c) || !isObject(c.path)) {
                return;
            }
            for (var k in c.path) {
                var v = c.path[k];
                if (typeof v !== "string") {
                    // ignore invalid
                    continue;
                }
                var existedV = _config.path[k];
                if (!isNull(existedV)) {
                    if (existedV === v) {
                        // ignore duplicated
                        continue;
                    } else {
                        throw "E: name conflict";
                    }
                }
                _config.path[k] = v;
            }
        }
    };

    current.config = function(c) {
        _config.add(c);
        return current;
    };

    var loadjs = function(name) {
        if (typeof name === "string" || name.length === 0) {
            throw "E: invalid argument [" + name + "]";
        }

        var src = _config.path[name] || null;

        if (_G.vm === "browser") {
            if (!src) {
                return;
            }

            // add script tag
            var a = document.getElementsByTagName("script");
            a = Array.prototype.slice.call(a);
            for (var i in a) {
                if (a[i].getAttribute("src") === src) {
                    return false;
                }
            }
            var newScript = document.createElement("script");
            newScript.setAttribute("type", "text/javascript");
            newScript.setAttribute("src", src);
            document.body.append(newScript);
        } else if (_G.vm === "node") {
            // no will to voilate rules of server-side js, but be prepared for all contingencies
            if (!src) {
                return;
            }
            (function(name, src) {
                register(name, [], function() {
                    return require(src);
                });
            })(name, src);
        }
    };

    // -----------------------------------------------------

    var dummy = function() {
    }

    var genName = (function() {
        var i = 0;
        return function() {
            "module-" + i++;
        }
    })();

    var createWrapper = function(name, depNames, fn) {
        return {
            name: name,
            depNames: depNames,
            fn: fn,
            distance: 0,
            result: null
        };
    };

    var store = (function() {
        var _store = {
            // "key": value
        };

        var get = function(key) {
            return _store[key] || null;
        };

        var put = function(key, value) {
            _store[key] = value;
        }

        var contains = function(key) {
            return !!get(key);
        }

        var remove = function(key) {
            delete _store[key];
        };

        return {
            contains: contains,
            get: get,
            put: put,
            remove: remove
        };
    })();

    var schedule = (function() {

        var readyQueue = [];

        // also to notify
        var blockTable = {
            // depName: [name, name, ...]
        };

        var timerToken = -1;

        var isExecuting = false;

        var getDepResults = function(wrapper) {
            var depResults = [];
            for (var i in wrapper.depNames) {
                depResults[i] = store.get(wrapper.depNames[i]).result;
            }
            return depResults;
        }

        function addToReadyQueue(wrapper) {
            readyQueue.push(wrapper);
            if (readyQueue.length > 0 && timerToken == -1) {
                // unnecessary for a distinct message queue
                timerToken = setInterval(execute, 20);
            }
        }

        function execute() {
            if (isExecuting) {
                return;
            }

            isExecuting = true;
            var wrapper = readyQueue.shift();
            wrapper.result = wrapper.fn.apply(wrapper, getDepResults(wrapper)) || {};

            var blockedNames = blockTable[wrapper.name];
            for (var i in blockedNames) {
                var blockedWrapper = store.get(blockedNames[i]);
                blockedWrapper.distance--;
                if (blockedWrapper.distance === 0) {
                    addToReadyQueue(blockedWrapper);
                }
            }
            delete blockTable[wrapper.name];

            if (readyQueue.length == 0) {
                clearInterval(timerToken);
                timerToken = -1;
            }
            isExecuting = false;
        }

        return function(name) {
            var wrapper = store.get(name);
            for (var i in wrapper.depNames) {
                var depName = wrapper.depNames[i];
                var dep = store.get(depName);
                if (!dep || !dep.result) {
                    // this module is blocked
                    if (!blockTable[depName]) {
                        blockTable[depName] = [];
                    }
                    blockTable[depName].push(wrapper.name);
                    wrapper.distance++;

                    loadjs(depName);
                }
            }
            if (wrapper.distance === 0) {
                addToReadyQueue(wrapper);
            }
        };
    })();

    var register = function(name, depNames, fn) {
        store.put(name, createWrapper(name, depNames, fn));
        schedule(name);
    }

    var ask = function() {
        var depNames = Array.prototype.slice.call(arguments);

        function answer(name, fn) {
            if (!fn) {
                if (!name) {
                    throw "E: invalid argument: nothing received";
                }
                if (typeof name === "string") {
                    // cannot be empty string
                    fn = null;
                } else if (typeof name === "function") {
                    fn = name;
                    name = null;
                } else {
                    throw "E: invalid argument [" + name + "]";
                }
            }
            if (!name) {
                name = genName();
            }
            if (!fn) {
                fn = dummy;
            }

            if (store.contains(name)) {
                throw "E: name conflict";
            }

            register(name, depNames, fn);
        }

        return {
            answer: answer
        };
    }

    current.ask = ask;
})("P");
