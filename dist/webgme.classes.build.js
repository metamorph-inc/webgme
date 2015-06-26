// define global GME variable
var GME = GME || {};

// property to access GME class definitions
GME.classes = GME.classes || {};

// property to access build in dependencies
GME.utils = GME.utils || {};

(function(){/** vim: et:ts=4:sw=4:sts=4
 * @license RequireJS 2.1.16 Copyright (c) 2010-2015, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/requirejs for details
 */
//Not using strict: uneven strict support in browsers, #392, and causes
//problems with requirejs.exec()/transpiler plugins that may not be strict.
/*jslint regexp: true, nomen: true, sloppy: true */
/*global window, navigator, document, importScripts, setTimeout, opera */

var requirejs, require, define;
(function (global) {
    var req, s, head, baseElement, dataMain, src,
        interactiveScript, currentlyAddingScript, mainScript, subPath,
        version = '2.1.16',
        commentRegExp = /(\/\*([\s\S]*?)\*\/|([^:]|^)\/\/(.*)$)/mg,
        cjsRequireRegExp = /[^.]\s*require\s*\(\s*["']([^'"\s]+)["']\s*\)/g,
        jsSuffixRegExp = /\.js$/,
        currDirRegExp = /^\.\//,
        op = Object.prototype,
        ostring = op.toString,
        hasOwn = op.hasOwnProperty,
        ap = Array.prototype,
        apsp = ap.splice,
        isBrowser = !!(typeof window !== 'undefined' && typeof navigator !== 'undefined' && window.document),
        isWebWorker = !isBrowser && typeof importScripts !== 'undefined',
        //PS3 indicates loaded and complete, but need to wait for complete
        //specifically. Sequence is 'loading', 'loaded', execution,
        // then 'complete'. The UA check is unfortunate, but not sure how
        //to feature test w/o causing perf issues.
        readyRegExp = isBrowser && navigator.platform === 'PLAYSTATION 3' ?
                      /^complete$/ : /^(complete|loaded)$/,
        defContextName = '_',
        //Oh the tragedy, detecting opera. See the usage of isOpera for reason.
        isOpera = typeof opera !== 'undefined' && opera.toString() === '[object Opera]',
        contexts = {},
        cfg = {},
        globalDefQueue = [],
        useInteractive = false;

    function isFunction(it) {
        return ostring.call(it) === '[object Function]';
    }

    function isArray(it) {
        return ostring.call(it) === '[object Array]';
    }

    /**
     * Helper function for iterating over an array. If the func returns
     * a true value, it will break out of the loop.
     */
    function each(ary, func) {
        if (ary) {
            var i;
            for (i = 0; i < ary.length; i += 1) {
                if (ary[i] && func(ary[i], i, ary)) {
                    break;
                }
            }
        }
    }

    /**
     * Helper function for iterating over an array backwards. If the func
     * returns a true value, it will break out of the loop.
     */
    function eachReverse(ary, func) {
        if (ary) {
            var i;
            for (i = ary.length - 1; i > -1; i -= 1) {
                if (ary[i] && func(ary[i], i, ary)) {
                    break;
                }
            }
        }
    }

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    function getOwn(obj, prop) {
        return hasProp(obj, prop) && obj[prop];
    }

    /**
     * Cycles over properties in an object and calls a function for each
     * property value. If the function returns a truthy value, then the
     * iteration is stopped.
     */
    function eachProp(obj, func) {
        var prop;
        for (prop in obj) {
            if (hasProp(obj, prop)) {
                if (func(obj[prop], prop)) {
                    break;
                }
            }
        }
    }

    /**
     * Simple function to mix in properties from source into target,
     * but only if target does not already have a property of the same name.
     */
    function mixin(target, source, force, deepStringMixin) {
        if (source) {
            eachProp(source, function (value, prop) {
                if (force || !hasProp(target, prop)) {
                    if (deepStringMixin && typeof value === 'object' && value &&
                        !isArray(value) && !isFunction(value) &&
                        !(value instanceof RegExp)) {

                        if (!target[prop]) {
                            target[prop] = {};
                        }
                        mixin(target[prop], value, force, deepStringMixin);
                    } else {
                        target[prop] = value;
                    }
                }
            });
        }
        return target;
    }

    //Similar to Function.prototype.bind, but the 'this' object is specified
    //first, since it is easier to read/figure out what 'this' will be.
    function bind(obj, fn) {
        return function () {
            return fn.apply(obj, arguments);
        };
    }

    function scripts() {
        return document.getElementsByTagName('script');
    }

    function defaultOnError(err) {
        throw err;
    }

    //Allow getting a global that is expressed in
    //dot notation, like 'a.b.c'.
    function getGlobal(value) {
        if (!value) {
            return value;
        }
        var g = global;
        each(value.split('.'), function (part) {
            g = g[part];
        });
        return g;
    }

    /**
     * Constructs an error with a pointer to an URL with more information.
     * @param {String} id the error ID that maps to an ID on a web page.
     * @param {String} message human readable error.
     * @param {Error} [err] the original error, if there is one.
     *
     * @returns {Error}
     */
    function makeError(id, msg, err, requireModules) {
        var e = new Error(msg + '\nhttp://requirejs.org/docs/errors.html#' + id);
        e.requireType = id;
        e.requireModules = requireModules;
        if (err) {
            e.originalError = err;
        }
        return e;
    }

    if (typeof define !== 'undefined') {
        //If a define is already in play via another AMD loader,
        //do not overwrite.
        return;
    }

    if (typeof requirejs !== 'undefined') {
        if (isFunction(requirejs)) {
            //Do not overwrite an existing requirejs instance.
            return;
        }
        cfg = requirejs;
        requirejs = undefined;
    }

    //Allow for a require config object
    if (typeof require !== 'undefined' && !isFunction(require)) {
        //assume it is a config object.
        cfg = require;
        require = undefined;
    }

    function newContext(contextName) {
        var inCheckLoaded, Module, context, handlers,
            checkLoadedTimeoutId,
            config = {
                //Defaults. Do not set a default for map
                //config to speed up normalize(), which
                //will run faster if there is no default.
                waitSeconds: 7,
                baseUrl: './',
                paths: {},
                bundles: {},
                pkgs: {},
                shim: {},
                config: {}
            },
            registry = {},
            //registry of just enabled modules, to speed
            //cycle breaking code when lots of modules
            //are registered, but not activated.
            enabledRegistry = {},
            undefEvents = {},
            defQueue = [],
            defined = {},
            urlFetched = {},
            bundlesMap = {},
            requireCounter = 1,
            unnormalizedCounter = 1;

        /**
         * Trims the . and .. from an array of path segments.
         * It will keep a leading path segment if a .. will become
         * the first path segment, to help with module name lookups,
         * which act like paths, but can be remapped. But the end result,
         * all paths that use this function should look normalized.
         * NOTE: this method MODIFIES the input array.
         * @param {Array} ary the array of path segments.
         */
        function trimDots(ary) {
            var i, part;
            for (i = 0; i < ary.length; i++) {
                part = ary[i];
                if (part === '.') {
                    ary.splice(i, 1);
                    i -= 1;
                } else if (part === '..') {
                    // If at the start, or previous value is still ..,
                    // keep them so that when converted to a path it may
                    // still work when converted to a path, even though
                    // as an ID it is less than ideal. In larger point
                    // releases, may be better to just kick out an error.
                    if (i === 0 || (i == 1 && ary[2] === '..') || ary[i - 1] === '..') {
                        continue;
                    } else if (i > 0) {
                        ary.splice(i - 1, 2);
                        i -= 2;
                    }
                }
            }
        }

        /**
         * Given a relative module name, like ./something, normalize it to
         * a real name that can be mapped to a path.
         * @param {String} name the relative name
         * @param {String} baseName a real name that the name arg is relative
         * to.
         * @param {Boolean} applyMap apply the map config to the value. Should
         * only be done if this normalization is for a dependency ID.
         * @returns {String} normalized name
         */
        function normalize(name, baseName, applyMap) {
            var pkgMain, mapValue, nameParts, i, j, nameSegment, lastIndex,
                foundMap, foundI, foundStarMap, starI, normalizedBaseParts,
                baseParts = (baseName && baseName.split('/')),
                map = config.map,
                starMap = map && map['*'];

            //Adjust any relative paths.
            if (name) {
                name = name.split('/');
                lastIndex = name.length - 1;

                // If wanting node ID compatibility, strip .js from end
                // of IDs. Have to do this here, and not in nameToUrl
                // because node allows either .js or non .js to map
                // to same file.
                if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                    name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
                }

                // Starts with a '.' so need the baseName
                if (name[0].charAt(0) === '.' && baseParts) {
                    //Convert baseName to array, and lop off the last part,
                    //so that . matches that 'directory' and not name of the baseName's
                    //module. For instance, baseName of 'one/two/three', maps to
                    //'one/two/three.js', but we want the directory, 'one/two' for
                    //this normalization.
                    normalizedBaseParts = baseParts.slice(0, baseParts.length - 1);
                    name = normalizedBaseParts.concat(name);
                }

                trimDots(name);
                name = name.join('/');
            }

            //Apply map config if available.
            if (applyMap && map && (baseParts || starMap)) {
                nameParts = name.split('/');

                outerLoop: for (i = nameParts.length; i > 0; i -= 1) {
                    nameSegment = nameParts.slice(0, i).join('/');

                    if (baseParts) {
                        //Find the longest baseName segment match in the config.
                        //So, do joins on the biggest to smallest lengths of baseParts.
                        for (j = baseParts.length; j > 0; j -= 1) {
                            mapValue = getOwn(map, baseParts.slice(0, j).join('/'));

                            //baseName segment has config, find if it has one for
                            //this name.
                            if (mapValue) {
                                mapValue = getOwn(mapValue, nameSegment);
                                if (mapValue) {
                                    //Match, update name to the new value.
                                    foundMap = mapValue;
                                    foundI = i;
                                    break outerLoop;
                                }
                            }
                        }
                    }

                    //Check for a star map match, but just hold on to it,
                    //if there is a shorter segment match later in a matching
                    //config, then favor over this star map.
                    if (!foundStarMap && starMap && getOwn(starMap, nameSegment)) {
                        foundStarMap = getOwn(starMap, nameSegment);
                        starI = i;
                    }
                }

                if (!foundMap && foundStarMap) {
                    foundMap = foundStarMap;
                    foundI = starI;
                }

                if (foundMap) {
                    nameParts.splice(0, foundI, foundMap);
                    name = nameParts.join('/');
                }
            }

            // If the name points to a package's name, use
            // the package main instead.
            pkgMain = getOwn(config.pkgs, name);

            return pkgMain ? pkgMain : name;
        }

        function removeScript(name) {
            if (isBrowser) {
                each(scripts(), function (scriptNode) {
                    if (scriptNode.getAttribute('data-requiremodule') === name &&
                            scriptNode.getAttribute('data-requirecontext') === context.contextName) {
                        scriptNode.parentNode.removeChild(scriptNode);
                        return true;
                    }
                });
            }
        }

        function hasPathFallback(id) {
            var pathConfig = getOwn(config.paths, id);
            if (pathConfig && isArray(pathConfig) && pathConfig.length > 1) {
                //Pop off the first array value, since it failed, and
                //retry
                pathConfig.shift();
                context.require.undef(id);

                //Custom require that does not do map translation, since
                //ID is "absolute", already mapped/resolved.
                context.makeRequire(null, {
                    skipMap: true
                })([id]);

                return true;
            }
        }

        //Turns a plugin!resource to [plugin, resource]
        //with the plugin being undefined if the name
        //did not have a plugin prefix.
        function splitPrefix(name) {
            var prefix,
                index = name ? name.indexOf('!') : -1;
            if (index > -1) {
                prefix = name.substring(0, index);
                name = name.substring(index + 1, name.length);
            }
            return [prefix, name];
        }

        /**
         * Creates a module mapping that includes plugin prefix, module
         * name, and path. If parentModuleMap is provided it will
         * also normalize the name via require.normalize()
         *
         * @param {String} name the module name
         * @param {String} [parentModuleMap] parent module map
         * for the module name, used to resolve relative names.
         * @param {Boolean} isNormalized: is the ID already normalized.
         * This is true if this call is done for a define() module ID.
         * @param {Boolean} applyMap: apply the map config to the ID.
         * Should only be true if this map is for a dependency.
         *
         * @returns {Object}
         */
        function makeModuleMap(name, parentModuleMap, isNormalized, applyMap) {
            var url, pluginModule, suffix, nameParts,
                prefix = null,
                parentName = parentModuleMap ? parentModuleMap.name : null,
                originalName = name,
                isDefine = true,
                normalizedName = '';

            //If no name, then it means it is a require call, generate an
            //internal name.
            if (!name) {
                isDefine = false;
                name = '_@r' + (requireCounter += 1);
            }

            nameParts = splitPrefix(name);
            prefix = nameParts[0];
            name = nameParts[1];

            if (prefix) {
                prefix = normalize(prefix, parentName, applyMap);
                pluginModule = getOwn(defined, prefix);
            }

            //Account for relative paths if there is a base name.
            if (name) {
                if (prefix) {
                    if (pluginModule && pluginModule.normalize) {
                        //Plugin is loaded, use its normalize method.
                        normalizedName = pluginModule.normalize(name, function (name) {
                            return normalize(name, parentName, applyMap);
                        });
                    } else {
                        // If nested plugin references, then do not try to
                        // normalize, as it will not normalize correctly. This
                        // places a restriction on resourceIds, and the longer
                        // term solution is not to normalize until plugins are
                        // loaded and all normalizations to allow for async
                        // loading of a loader plugin. But for now, fixes the
                        // common uses. Details in #1131
                        normalizedName = name.indexOf('!') === -1 ?
                                         normalize(name, parentName, applyMap) :
                                         name;
                    }
                } else {
                    //A regular module.
                    normalizedName = normalize(name, parentName, applyMap);

                    //Normalized name may be a plugin ID due to map config
                    //application in normalize. The map config values must
                    //already be normalized, so do not need to redo that part.
                    nameParts = splitPrefix(normalizedName);
                    prefix = nameParts[0];
                    normalizedName = nameParts[1];
                    isNormalized = true;

                    url = context.nameToUrl(normalizedName);
                }
            }

            //If the id is a plugin id that cannot be determined if it needs
            //normalization, stamp it with a unique ID so two matching relative
            //ids that may conflict can be separate.
            suffix = prefix && !pluginModule && !isNormalized ?
                     '_unnormalized' + (unnormalizedCounter += 1) :
                     '';

            return {
                prefix: prefix,
                name: normalizedName,
                parentMap: parentModuleMap,
                unnormalized: !!suffix,
                url: url,
                originalName: originalName,
                isDefine: isDefine,
                id: (prefix ?
                        prefix + '!' + normalizedName :
                        normalizedName) + suffix
            };
        }

        function getModule(depMap) {
            var id = depMap.id,
                mod = getOwn(registry, id);

            if (!mod) {
                mod = registry[id] = new context.Module(depMap);
            }

            return mod;
        }

        function on(depMap, name, fn) {
            var id = depMap.id,
                mod = getOwn(registry, id);

            if (hasProp(defined, id) &&
                    (!mod || mod.defineEmitComplete)) {
                if (name === 'defined') {
                    fn(defined[id]);
                }
            } else {
                mod = getModule(depMap);
                if (mod.error && name === 'error') {
                    fn(mod.error);
                } else {
                    mod.on(name, fn);
                }
            }
        }

        function onError(err, errback) {
            var ids = err.requireModules,
                notified = false;

            if (errback) {
                errback(err);
            } else {
                each(ids, function (id) {
                    var mod = getOwn(registry, id);
                    if (mod) {
                        //Set error on module, so it skips timeout checks.
                        mod.error = err;
                        if (mod.events.error) {
                            notified = true;
                            mod.emit('error', err);
                        }
                    }
                });

                if (!notified) {
                    req.onError(err);
                }
            }
        }

        /**
         * Internal method to transfer globalQueue items to this context's
         * defQueue.
         */
        function takeGlobalQueue() {
            //Push all the globalDefQueue items into the context's defQueue
            if (globalDefQueue.length) {
                //Array splice in the values since the context code has a
                //local var ref to defQueue, so cannot just reassign the one
                //on context.
                apsp.apply(defQueue,
                           [defQueue.length, 0].concat(globalDefQueue));
                globalDefQueue = [];
            }
        }

        handlers = {
            'require': function (mod) {
                if (mod.require) {
                    return mod.require;
                } else {
                    return (mod.require = context.makeRequire(mod.map));
                }
            },
            'exports': function (mod) {
                mod.usingExports = true;
                if (mod.map.isDefine) {
                    if (mod.exports) {
                        return (defined[mod.map.id] = mod.exports);
                    } else {
                        return (mod.exports = defined[mod.map.id] = {});
                    }
                }
            },
            'module': function (mod) {
                if (mod.module) {
                    return mod.module;
                } else {
                    return (mod.module = {
                        id: mod.map.id,
                        uri: mod.map.url,
                        config: function () {
                            return  getOwn(config.config, mod.map.id) || {};
                        },
                        exports: mod.exports || (mod.exports = {})
                    });
                }
            }
        };

        function cleanRegistry(id) {
            //Clean up machinery used for waiting modules.
            delete registry[id];
            delete enabledRegistry[id];
        }

        function breakCycle(mod, traced, processed) {
            var id = mod.map.id;

            if (mod.error) {
                mod.emit('error', mod.error);
            } else {
                traced[id] = true;
                each(mod.depMaps, function (depMap, i) {
                    var depId = depMap.id,
                        dep = getOwn(registry, depId);

                    //Only force things that have not completed
                    //being defined, so still in the registry,
                    //and only if it has not been matched up
                    //in the module already.
                    if (dep && !mod.depMatched[i] && !processed[depId]) {
                        if (getOwn(traced, depId)) {
                            mod.defineDep(i, defined[depId]);
                            mod.check(); //pass false?
                        } else {
                            breakCycle(dep, traced, processed);
                        }
                    }
                });
                processed[id] = true;
            }
        }

        function checkLoaded() {
            var err, usingPathFallback,
                waitInterval = config.waitSeconds * 1000,
                //It is possible to disable the wait interval by using waitSeconds of 0.
                expired = waitInterval && (context.startTime + waitInterval) < new Date().getTime(),
                noLoads = [],
                reqCalls = [],
                stillLoading = false,
                needCycleCheck = true;

            //Do not bother if this call was a result of a cycle break.
            if (inCheckLoaded) {
                return;
            }

            inCheckLoaded = true;

            //Figure out the state of all the modules.
            eachProp(enabledRegistry, function (mod) {
                var map = mod.map,
                    modId = map.id;

                //Skip things that are not enabled or in error state.
                if (!mod.enabled) {
                    return;
                }

                if (!map.isDefine) {
                    reqCalls.push(mod);
                }

                if (!mod.error) {
                    //If the module should be executed, and it has not
                    //been inited and time is up, remember it.
                    if (!mod.inited && expired) {
                        if (hasPathFallback(modId)) {
                            usingPathFallback = true;
                            stillLoading = true;
                        } else {
                            noLoads.push(modId);
                            removeScript(modId);
                        }
                    } else if (!mod.inited && mod.fetched && map.isDefine) {
                        stillLoading = true;
                        if (!map.prefix) {
                            //No reason to keep looking for unfinished
                            //loading. If the only stillLoading is a
                            //plugin resource though, keep going,
                            //because it may be that a plugin resource
                            //is waiting on a non-plugin cycle.
                            return (needCycleCheck = false);
                        }
                    }
                }
            });

            if (expired && noLoads.length) {
                //If wait time expired, throw error of unloaded modules.
                err = makeError('timeout', 'Load timeout for modules: ' + noLoads, null, noLoads);
                err.contextName = context.contextName;
                return onError(err);
            }

            //Not expired, check for a cycle.
            if (needCycleCheck) {
                each(reqCalls, function (mod) {
                    breakCycle(mod, {}, {});
                });
            }

            //If still waiting on loads, and the waiting load is something
            //other than a plugin resource, or there are still outstanding
            //scripts, then just try back later.
            if ((!expired || usingPathFallback) && stillLoading) {
                //Something is still waiting to load. Wait for it, but only
                //if a timeout is not already in effect.
                if ((isBrowser || isWebWorker) && !checkLoadedTimeoutId) {
                    checkLoadedTimeoutId = setTimeout(function () {
                        checkLoadedTimeoutId = 0;
                        checkLoaded();
                    }, 50);
                }
            }

            inCheckLoaded = false;
        }

        Module = function (map) {
            this.events = getOwn(undefEvents, map.id) || {};
            this.map = map;
            this.shim = getOwn(config.shim, map.id);
            this.depExports = [];
            this.depMaps = [];
            this.depMatched = [];
            this.pluginMaps = {};
            this.depCount = 0;

            /* this.exports this.factory
               this.depMaps = [],
               this.enabled, this.fetched
            */
        };

        Module.prototype = {
            init: function (depMaps, factory, errback, options) {
                options = options || {};

                //Do not do more inits if already done. Can happen if there
                //are multiple define calls for the same module. That is not
                //a normal, common case, but it is also not unexpected.
                if (this.inited) {
                    return;
                }

                this.factory = factory;

                if (errback) {
                    //Register for errors on this module.
                    this.on('error', errback);
                } else if (this.events.error) {
                    //If no errback already, but there are error listeners
                    //on this module, set up an errback to pass to the deps.
                    errback = bind(this, function (err) {
                        this.emit('error', err);
                    });
                }

                //Do a copy of the dependency array, so that
                //source inputs are not modified. For example
                //"shim" deps are passed in here directly, and
                //doing a direct modification of the depMaps array
                //would affect that config.
                this.depMaps = depMaps && depMaps.slice(0);

                this.errback = errback;

                //Indicate this module has be initialized
                this.inited = true;

                this.ignore = options.ignore;

                //Could have option to init this module in enabled mode,
                //or could have been previously marked as enabled. However,
                //the dependencies are not known until init is called. So
                //if enabled previously, now trigger dependencies as enabled.
                if (options.enabled || this.enabled) {
                    //Enable this module and dependencies.
                    //Will call this.check()
                    this.enable();
                } else {
                    this.check();
                }
            },

            defineDep: function (i, depExports) {
                //Because of cycles, defined callback for a given
                //export can be called more than once.
                if (!this.depMatched[i]) {
                    this.depMatched[i] = true;
                    this.depCount -= 1;
                    this.depExports[i] = depExports;
                }
            },

            fetch: function () {
                if (this.fetched) {
                    return;
                }
                this.fetched = true;

                context.startTime = (new Date()).getTime();

                var map = this.map;

                //If the manager is for a plugin managed resource,
                //ask the plugin to load it now.
                if (this.shim) {
                    context.makeRequire(this.map, {
                        enableBuildCallback: true
                    })(this.shim.deps || [], bind(this, function () {
                        return map.prefix ? this.callPlugin() : this.load();
                    }));
                } else {
                    //Regular dependency.
                    return map.prefix ? this.callPlugin() : this.load();
                }
            },

            load: function () {
                var url = this.map.url;

                //Regular dependency.
                if (!urlFetched[url]) {
                    urlFetched[url] = true;
                    context.load(this.map.id, url);
                }
            },

            /**
             * Checks if the module is ready to define itself, and if so,
             * define it.
             */
            check: function () {
                if (!this.enabled || this.enabling) {
                    return;
                }

                var err, cjsModule,
                    id = this.map.id,
                    depExports = this.depExports,
                    exports = this.exports,
                    factory = this.factory;

                if (!this.inited) {
                    this.fetch();
                } else if (this.error) {
                    this.emit('error', this.error);
                } else if (!this.defining) {
                    //The factory could trigger another require call
                    //that would result in checking this module to
                    //define itself again. If already in the process
                    //of doing that, skip this work.
                    this.defining = true;

                    if (this.depCount < 1 && !this.defined) {
                        if (isFunction(factory)) {
                            //If there is an error listener, favor passing
                            //to that instead of throwing an error. However,
                            //only do it for define()'d  modules. require
                            //errbacks should not be called for failures in
                            //their callbacks (#699). However if a global
                            //onError is set, use that.
                            if ((this.events.error && this.map.isDefine) ||
                                req.onError !== defaultOnError) {
                                try {
                                    exports = context.execCb(id, factory, depExports, exports);
                                } catch (e) {
                                    err = e;
                                }
                            } else {
                                exports = context.execCb(id, factory, depExports, exports);
                            }

                            // Favor return value over exports. If node/cjs in play,
                            // then will not have a return value anyway. Favor
                            // module.exports assignment over exports object.
                            if (this.map.isDefine && exports === undefined) {
                                cjsModule = this.module;
                                if (cjsModule) {
                                    exports = cjsModule.exports;
                                } else if (this.usingExports) {
                                    //exports already set the defined value.
                                    exports = this.exports;
                                }
                            }

                            if (err) {
                                err.requireMap = this.map;
                                err.requireModules = this.map.isDefine ? [this.map.id] : null;
                                err.requireType = this.map.isDefine ? 'define' : 'require';
                                return onError((this.error = err));
                            }

                        } else {
                            //Just a literal value
                            exports = factory;
                        }

                        this.exports = exports;

                        if (this.map.isDefine && !this.ignore) {
                            defined[id] = exports;

                            if (req.onResourceLoad) {
                                req.onResourceLoad(context, this.map, this.depMaps);
                            }
                        }

                        //Clean up
                        cleanRegistry(id);

                        this.defined = true;
                    }

                    //Finished the define stage. Allow calling check again
                    //to allow define notifications below in the case of a
                    //cycle.
                    this.defining = false;

                    if (this.defined && !this.defineEmitted) {
                        this.defineEmitted = true;
                        this.emit('defined', this.exports);
                        this.defineEmitComplete = true;
                    }

                }
            },

            callPlugin: function () {
                var map = this.map,
                    id = map.id,
                    //Map already normalized the prefix.
                    pluginMap = makeModuleMap(map.prefix);

                //Mark this as a dependency for this plugin, so it
                //can be traced for cycles.
                this.depMaps.push(pluginMap);

                on(pluginMap, 'defined', bind(this, function (plugin) {
                    var load, normalizedMap, normalizedMod,
                        bundleId = getOwn(bundlesMap, this.map.id),
                        name = this.map.name,
                        parentName = this.map.parentMap ? this.map.parentMap.name : null,
                        localRequire = context.makeRequire(map.parentMap, {
                            enableBuildCallback: true
                        });

                    //If current map is not normalized, wait for that
                    //normalized name to load instead of continuing.
                    if (this.map.unnormalized) {
                        //Normalize the ID if the plugin allows it.
                        if (plugin.normalize) {
                            name = plugin.normalize(name, function (name) {
                                return normalize(name, parentName, true);
                            }) || '';
                        }

                        //prefix and name should already be normalized, no need
                        //for applying map config again either.
                        normalizedMap = makeModuleMap(map.prefix + '!' + name,
                                                      this.map.parentMap);
                        on(normalizedMap,
                            'defined', bind(this, function (value) {
                                this.init([], function () { return value; }, null, {
                                    enabled: true,
                                    ignore: true
                                });
                            }));

                        normalizedMod = getOwn(registry, normalizedMap.id);
                        if (normalizedMod) {
                            //Mark this as a dependency for this plugin, so it
                            //can be traced for cycles.
                            this.depMaps.push(normalizedMap);

                            if (this.events.error) {
                                normalizedMod.on('error', bind(this, function (err) {
                                    this.emit('error', err);
                                }));
                            }
                            normalizedMod.enable();
                        }

                        return;
                    }

                    //If a paths config, then just load that file instead to
                    //resolve the plugin, as it is built into that paths layer.
                    if (bundleId) {
                        this.map.url = context.nameToUrl(bundleId);
                        this.load();
                        return;
                    }

                    load = bind(this, function (value) {
                        this.init([], function () { return value; }, null, {
                            enabled: true
                        });
                    });

                    load.error = bind(this, function (err) {
                        this.inited = true;
                        this.error = err;
                        err.requireModules = [id];

                        //Remove temp unnormalized modules for this module,
                        //since they will never be resolved otherwise now.
                        eachProp(registry, function (mod) {
                            if (mod.map.id.indexOf(id + '_unnormalized') === 0) {
                                cleanRegistry(mod.map.id);
                            }
                        });

                        onError(err);
                    });

                    //Allow plugins to load other code without having to know the
                    //context or how to 'complete' the load.
                    load.fromText = bind(this, function (text, textAlt) {
                        /*jslint evil: true */
                        var moduleName = map.name,
                            moduleMap = makeModuleMap(moduleName),
                            hasInteractive = useInteractive;

                        //As of 2.1.0, support just passing the text, to reinforce
                        //fromText only being called once per resource. Still
                        //support old style of passing moduleName but discard
                        //that moduleName in favor of the internal ref.
                        if (textAlt) {
                            text = textAlt;
                        }

                        //Turn off interactive script matching for IE for any define
                        //calls in the text, then turn it back on at the end.
                        if (hasInteractive) {
                            useInteractive = false;
                        }

                        //Prime the system by creating a module instance for
                        //it.
                        getModule(moduleMap);

                        //Transfer any config to this other module.
                        if (hasProp(config.config, id)) {
                            config.config[moduleName] = config.config[id];
                        }

                        try {
                            req.exec(text);
                        } catch (e) {
                            return onError(makeError('fromtexteval',
                                             'fromText eval for ' + id +
                                            ' failed: ' + e,
                                             e,
                                             [id]));
                        }

                        if (hasInteractive) {
                            useInteractive = true;
                        }

                        //Mark this as a dependency for the plugin
                        //resource
                        this.depMaps.push(moduleMap);

                        //Support anonymous modules.
                        context.completeLoad(moduleName);

                        //Bind the value of that module to the value for this
                        //resource ID.
                        localRequire([moduleName], load);
                    });

                    //Use parentName here since the plugin's name is not reliable,
                    //could be some weird string with no path that actually wants to
                    //reference the parentName's path.
                    plugin.load(map.name, localRequire, load, config);
                }));

                context.enable(pluginMap, this);
                this.pluginMaps[pluginMap.id] = pluginMap;
            },

            enable: function () {
                enabledRegistry[this.map.id] = this;
                this.enabled = true;

                //Set flag mentioning that the module is enabling,
                //so that immediate calls to the defined callbacks
                //for dependencies do not trigger inadvertent load
                //with the depCount still being zero.
                this.enabling = true;

                //Enable each dependency
                each(this.depMaps, bind(this, function (depMap, i) {
                    var id, mod, handler;

                    if (typeof depMap === 'string') {
                        //Dependency needs to be converted to a depMap
                        //and wired up to this module.
                        depMap = makeModuleMap(depMap,
                                               (this.map.isDefine ? this.map : this.map.parentMap),
                                               false,
                                               !this.skipMap);
                        this.depMaps[i] = depMap;

                        handler = getOwn(handlers, depMap.id);

                        if (handler) {
                            this.depExports[i] = handler(this);
                            return;
                        }

                        this.depCount += 1;

                        on(depMap, 'defined', bind(this, function (depExports) {
                            this.defineDep(i, depExports);
                            this.check();
                        }));

                        if (this.errback) {
                            on(depMap, 'error', bind(this, this.errback));
                        } else if (this.events.error) {
                            // No direct errback on this module, but something
                            // else is listening for errors, so be sure to
                            // propagate the error correctly.
                            on(depMap, 'error', bind(this, function(err) {
                                this.emit('error', err);
                            }));
                        }
                    }

                    id = depMap.id;
                    mod = registry[id];

                    //Skip special modules like 'require', 'exports', 'module'
                    //Also, don't call enable if it is already enabled,
                    //important in circular dependency cases.
                    if (!hasProp(handlers, id) && mod && !mod.enabled) {
                        context.enable(depMap, this);
                    }
                }));

                //Enable each plugin that is used in
                //a dependency
                eachProp(this.pluginMaps, bind(this, function (pluginMap) {
                    var mod = getOwn(registry, pluginMap.id);
                    if (mod && !mod.enabled) {
                        context.enable(pluginMap, this);
                    }
                }));

                this.enabling = false;

                this.check();
            },

            on: function (name, cb) {
                var cbs = this.events[name];
                if (!cbs) {
                    cbs = this.events[name] = [];
                }
                cbs.push(cb);
            },

            emit: function (name, evt) {
                each(this.events[name], function (cb) {
                    cb(evt);
                });
                if (name === 'error') {
                    //Now that the error handler was triggered, remove
                    //the listeners, since this broken Module instance
                    //can stay around for a while in the registry.
                    delete this.events[name];
                }
            }
        };

        function callGetModule(args) {
            //Skip modules already defined.
            if (!hasProp(defined, args[0])) {
                getModule(makeModuleMap(args[0], null, true)).init(args[1], args[2]);
            }
        }

        function removeListener(node, func, name, ieName) {
            //Favor detachEvent because of IE9
            //issue, see attachEvent/addEventListener comment elsewhere
            //in this file.
            if (node.detachEvent && !isOpera) {
                //Probably IE. If not it will throw an error, which will be
                //useful to know.
                if (ieName) {
                    node.detachEvent(ieName, func);
                }
            } else {
                node.removeEventListener(name, func, false);
            }
        }

        /**
         * Given an event from a script node, get the requirejs info from it,
         * and then removes the event listeners on the node.
         * @param {Event} evt
         * @returns {Object}
         */
        function getScriptData(evt) {
            //Using currentTarget instead of target for Firefox 2.0's sake. Not
            //all old browsers will be supported, but this one was easy enough
            //to support and still makes sense.
            var node = evt.currentTarget || evt.srcElement;

            //Remove the listeners once here.
            removeListener(node, context.onScriptLoad, 'load', 'onreadystatechange');
            removeListener(node, context.onScriptError, 'error');

            return {
                node: node,
                id: node && node.getAttribute('data-requiremodule')
            };
        }

        function intakeDefines() {
            var args;

            //Any defined modules in the global queue, intake them now.
            takeGlobalQueue();

            //Make sure any remaining defQueue items get properly processed.
            while (defQueue.length) {
                args = defQueue.shift();
                if (args[0] === null) {
                    return onError(makeError('mismatch', 'Mismatched anonymous define() module: ' + args[args.length - 1]));
                } else {
                    //args are id, deps, factory. Should be normalized by the
                    //define() function.
                    callGetModule(args);
                }
            }
        }

        context = {
            config: config,
            contextName: contextName,
            registry: registry,
            defined: defined,
            urlFetched: urlFetched,
            defQueue: defQueue,
            Module: Module,
            makeModuleMap: makeModuleMap,
            nextTick: req.nextTick,
            onError: onError,

            /**
             * Set a configuration for the context.
             * @param {Object} cfg config object to integrate.
             */
            configure: function (cfg) {
                //Make sure the baseUrl ends in a slash.
                if (cfg.baseUrl) {
                    if (cfg.baseUrl.charAt(cfg.baseUrl.length - 1) !== '/') {
                        cfg.baseUrl += '/';
                    }
                }

                //Save off the paths since they require special processing,
                //they are additive.
                var shim = config.shim,
                    objs = {
                        paths: true,
                        bundles: true,
                        config: true,
                        map: true
                    };

                eachProp(cfg, function (value, prop) {
                    if (objs[prop]) {
                        if (!config[prop]) {
                            config[prop] = {};
                        }
                        mixin(config[prop], value, true, true);
                    } else {
                        config[prop] = value;
                    }
                });

                //Reverse map the bundles
                if (cfg.bundles) {
                    eachProp(cfg.bundles, function (value, prop) {
                        each(value, function (v) {
                            if (v !== prop) {
                                bundlesMap[v] = prop;
                            }
                        });
                    });
                }

                //Merge shim
                if (cfg.shim) {
                    eachProp(cfg.shim, function (value, id) {
                        //Normalize the structure
                        if (isArray(value)) {
                            value = {
                                deps: value
                            };
                        }
                        if ((value.exports || value.init) && !value.exportsFn) {
                            value.exportsFn = context.makeShimExports(value);
                        }
                        shim[id] = value;
                    });
                    config.shim = shim;
                }

                //Adjust packages if necessary.
                if (cfg.packages) {
                    each(cfg.packages, function (pkgObj) {
                        var location, name;

                        pkgObj = typeof pkgObj === 'string' ? { name: pkgObj } : pkgObj;

                        name = pkgObj.name;
                        location = pkgObj.location;
                        if (location) {
                            config.paths[name] = pkgObj.location;
                        }

                        //Save pointer to main module ID for pkg name.
                        //Remove leading dot in main, so main paths are normalized,
                        //and remove any trailing .js, since different package
                        //envs have different conventions: some use a module name,
                        //some use a file name.
                        config.pkgs[name] = pkgObj.name + '/' + (pkgObj.main || 'main')
                                     .replace(currDirRegExp, '')
                                     .replace(jsSuffixRegExp, '');
                    });
                }

                //If there are any "waiting to execute" modules in the registry,
                //update the maps for them, since their info, like URLs to load,
                //may have changed.
                eachProp(registry, function (mod, id) {
                    //If module already has init called, since it is too
                    //late to modify them, and ignore unnormalized ones
                    //since they are transient.
                    if (!mod.inited && !mod.map.unnormalized) {
                        mod.map = makeModuleMap(id);
                    }
                });

                //If a deps array or a config callback is specified, then call
                //require with those args. This is useful when require is defined as a
                //config object before require.js is loaded.
                if (cfg.deps || cfg.callback) {
                    context.require(cfg.deps || [], cfg.callback);
                }
            },

            makeShimExports: function (value) {
                function fn() {
                    var ret;
                    if (value.init) {
                        ret = value.init.apply(global, arguments);
                    }
                    return ret || (value.exports && getGlobal(value.exports));
                }
                return fn;
            },

            makeRequire: function (relMap, options) {
                options = options || {};

                function localRequire(deps, callback, errback) {
                    var id, map, requireMod;

                    if (options.enableBuildCallback && callback && isFunction(callback)) {
                        callback.__requireJsBuild = true;
                    }

                    if (typeof deps === 'string') {
                        if (isFunction(callback)) {
                            //Invalid call
                            return onError(makeError('requireargs', 'Invalid require call'), errback);
                        }

                        //If require|exports|module are requested, get the
                        //value for them from the special handlers. Caveat:
                        //this only works while module is being defined.
                        if (relMap && hasProp(handlers, deps)) {
                            return handlers[deps](registry[relMap.id]);
                        }

                        //Synchronous access to one module. If require.get is
                        //available (as in the Node adapter), prefer that.
                        if (req.get) {
                            return req.get(context, deps, relMap, localRequire);
                        }

                        //Normalize module name, if it contains . or ..
                        map = makeModuleMap(deps, relMap, false, true);
                        id = map.id;

                        if (!hasProp(defined, id)) {
                            return onError(makeError('notloaded', 'Module name "' +
                                        id +
                                        '" has not been loaded yet for context: ' +
                                        contextName +
                                        (relMap ? '' : '. Use require([])')));
                        }
                        return defined[id];
                    }

                    //Grab defines waiting in the global queue.
                    intakeDefines();

                    //Mark all the dependencies as needing to be loaded.
                    context.nextTick(function () {
                        //Some defines could have been added since the
                        //require call, collect them.
                        intakeDefines();

                        requireMod = getModule(makeModuleMap(null, relMap));

                        //Store if map config should be applied to this require
                        //call for dependencies.
                        requireMod.skipMap = options.skipMap;

                        requireMod.init(deps, callback, errback, {
                            enabled: true
                        });

                        checkLoaded();
                    });

                    return localRequire;
                }

                mixin(localRequire, {
                    isBrowser: isBrowser,

                    /**
                     * Converts a module name + .extension into an URL path.
                     * *Requires* the use of a module name. It does not support using
                     * plain URLs like nameToUrl.
                     */
                    toUrl: function (moduleNamePlusExt) {
                        var ext,
                            index = moduleNamePlusExt.lastIndexOf('.'),
                            segment = moduleNamePlusExt.split('/')[0],
                            isRelative = segment === '.' || segment === '..';

                        //Have a file extension alias, and it is not the
                        //dots from a relative path.
                        if (index !== -1 && (!isRelative || index > 1)) {
                            ext = moduleNamePlusExt.substring(index, moduleNamePlusExt.length);
                            moduleNamePlusExt = moduleNamePlusExt.substring(0, index);
                        }

                        return context.nameToUrl(normalize(moduleNamePlusExt,
                                                relMap && relMap.id, true), ext,  true);
                    },

                    defined: function (id) {
                        return hasProp(defined, makeModuleMap(id, relMap, false, true).id);
                    },

                    specified: function (id) {
                        id = makeModuleMap(id, relMap, false, true).id;
                        return hasProp(defined, id) || hasProp(registry, id);
                    }
                });

                //Only allow undef on top level require calls
                if (!relMap) {
                    localRequire.undef = function (id) {
                        //Bind any waiting define() calls to this context,
                        //fix for #408
                        takeGlobalQueue();

                        var map = makeModuleMap(id, relMap, true),
                            mod = getOwn(registry, id);

                        removeScript(id);

                        delete defined[id];
                        delete urlFetched[map.url];
                        delete undefEvents[id];

                        //Clean queued defines too. Go backwards
                        //in array so that the splices do not
                        //mess up the iteration.
                        eachReverse(defQueue, function(args, i) {
                            if(args[0] === id) {
                                defQueue.splice(i, 1);
                            }
                        });

                        if (mod) {
                            //Hold on to listeners in case the
                            //module will be attempted to be reloaded
                            //using a different config.
                            if (mod.events.defined) {
                                undefEvents[id] = mod.events;
                            }

                            cleanRegistry(id);
                        }
                    };
                }

                return localRequire;
            },

            /**
             * Called to enable a module if it is still in the registry
             * awaiting enablement. A second arg, parent, the parent module,
             * is passed in for context, when this method is overridden by
             * the optimizer. Not shown here to keep code compact.
             */
            enable: function (depMap) {
                var mod = getOwn(registry, depMap.id);
                if (mod) {
                    getModule(depMap).enable();
                }
            },

            /**
             * Internal method used by environment adapters to complete a load event.
             * A load event could be a script load or just a load pass from a synchronous
             * load call.
             * @param {String} moduleName the name of the module to potentially complete.
             */
            completeLoad: function (moduleName) {
                var found, args, mod,
                    shim = getOwn(config.shim, moduleName) || {},
                    shExports = shim.exports;

                takeGlobalQueue();

                while (defQueue.length) {
                    args = defQueue.shift();
                    if (args[0] === null) {
                        args[0] = moduleName;
                        //If already found an anonymous module and bound it
                        //to this name, then this is some other anon module
                        //waiting for its completeLoad to fire.
                        if (found) {
                            break;
                        }
                        found = true;
                    } else if (args[0] === moduleName) {
                        //Found matching define call for this script!
                        found = true;
                    }

                    callGetModule(args);
                }

                //Do this after the cycle of callGetModule in case the result
                //of those calls/init calls changes the registry.
                mod = getOwn(registry, moduleName);

                if (!found && !hasProp(defined, moduleName) && mod && !mod.inited) {
                    if (config.enforceDefine && (!shExports || !getGlobal(shExports))) {
                        if (hasPathFallback(moduleName)) {
                            return;
                        } else {
                            return onError(makeError('nodefine',
                                             'No define call for ' + moduleName,
                                             null,
                                             [moduleName]));
                        }
                    } else {
                        //A script that does not call define(), so just simulate
                        //the call for it.
                        callGetModule([moduleName, (shim.deps || []), shim.exportsFn]);
                    }
                }

                checkLoaded();
            },

            /**
             * Converts a module name to a file path. Supports cases where
             * moduleName may actually be just an URL.
             * Note that it **does not** call normalize on the moduleName,
             * it is assumed to have already been normalized. This is an
             * internal API, not a public one. Use toUrl for the public API.
             */
            nameToUrl: function (moduleName, ext, skipExt) {
                var paths, syms, i, parentModule, url,
                    parentPath, bundleId,
                    pkgMain = getOwn(config.pkgs, moduleName);

                if (pkgMain) {
                    moduleName = pkgMain;
                }

                bundleId = getOwn(bundlesMap, moduleName);

                if (bundleId) {
                    return context.nameToUrl(bundleId, ext, skipExt);
                }

                //If a colon is in the URL, it indicates a protocol is used and it is just
                //an URL to a file, or if it starts with a slash, contains a query arg (i.e. ?)
                //or ends with .js, then assume the user meant to use an url and not a module id.
                //The slash is important for protocol-less URLs as well as full paths.
                if (req.jsExtRegExp.test(moduleName)) {
                    //Just a plain path, not module name lookup, so just return it.
                    //Add extension if it is included. This is a bit wonky, only non-.js things pass
                    //an extension, this method probably needs to be reworked.
                    url = moduleName + (ext || '');
                } else {
                    //A module that needs to be converted to a path.
                    paths = config.paths;

                    syms = moduleName.split('/');
                    //For each module name segment, see if there is a path
                    //registered for it. Start with most specific name
                    //and work up from it.
                    for (i = syms.length; i > 0; i -= 1) {
                        parentModule = syms.slice(0, i).join('/');

                        parentPath = getOwn(paths, parentModule);
                        if (parentPath) {
                            //If an array, it means there are a few choices,
                            //Choose the one that is desired
                            if (isArray(parentPath)) {
                                parentPath = parentPath[0];
                            }
                            syms.splice(0, i, parentPath);
                            break;
                        }
                    }

                    //Join the path parts together, then figure out if baseUrl is needed.
                    url = syms.join('/');
                    url += (ext || (/^data\:|\?/.test(url) || skipExt ? '' : '.js'));
                    url = (url.charAt(0) === '/' || url.match(/^[\w\+\.\-]+:/) ? '' : config.baseUrl) + url;
                }

                return config.urlArgs ? url +
                                        ((url.indexOf('?') === -1 ? '?' : '&') +
                                         config.urlArgs) : url;
            },

            //Delegates to req.load. Broken out as a separate function to
            //allow overriding in the optimizer.
            load: function (id, url) {
                req.load(context, id, url);
            },

            /**
             * Executes a module callback function. Broken out as a separate function
             * solely to allow the build system to sequence the files in the built
             * layer in the right sequence.
             *
             * @private
             */
            execCb: function (name, callback, args, exports) {
                return callback.apply(exports, args);
            },

            /**
             * callback for script loads, used to check status of loading.
             *
             * @param {Event} evt the event from the browser for the script
             * that was loaded.
             */
            onScriptLoad: function (evt) {
                //Using currentTarget instead of target for Firefox 2.0's sake. Not
                //all old browsers will be supported, but this one was easy enough
                //to support and still makes sense.
                if (evt.type === 'load' ||
                        (readyRegExp.test((evt.currentTarget || evt.srcElement).readyState))) {
                    //Reset interactive script so a script node is not held onto for
                    //to long.
                    interactiveScript = null;

                    //Pull out the name of the module and the context.
                    var data = getScriptData(evt);
                    context.completeLoad(data.id);
                }
            },

            /**
             * Callback for script errors.
             */
            onScriptError: function (evt) {
                var data = getScriptData(evt);
                if (!hasPathFallback(data.id)) {
                    return onError(makeError('scripterror', 'Script error for: ' + data.id, evt, [data.id]));
                }
            }
        };

        context.require = context.makeRequire();
        return context;
    }

    /**
     * Main entry point.
     *
     * If the only argument to require is a string, then the module that
     * is represented by that string is fetched for the appropriate context.
     *
     * If the first argument is an array, then it will be treated as an array
     * of dependency string names to fetch. An optional function callback can
     * be specified to execute when all of those dependencies are available.
     *
     * Make a local req variable to help Caja compliance (it assumes things
     * on a require that are not standardized), and to give a short
     * name for minification/local scope use.
     */
    req = requirejs = function (deps, callback, errback, optional) {

        //Find the right context, use default
        var context, config,
            contextName = defContextName;

        // Determine if have config object in the call.
        if (!isArray(deps) && typeof deps !== 'string') {
            // deps is a config object
            config = deps;
            if (isArray(callback)) {
                // Adjust args if there are dependencies
                deps = callback;
                callback = errback;
                errback = optional;
            } else {
                deps = [];
            }
        }

        if (config && config.context) {
            contextName = config.context;
        }

        context = getOwn(contexts, contextName);
        if (!context) {
            context = contexts[contextName] = req.s.newContext(contextName);
        }

        if (config) {
            context.configure(config);
        }

        return context.require(deps, callback, errback);
    };

    /**
     * Support require.config() to make it easier to cooperate with other
     * AMD loaders on globally agreed names.
     */
    req.config = function (config) {
        return req(config);
    };

    /**
     * Execute something after the current tick
     * of the event loop. Override for other envs
     * that have a better solution than setTimeout.
     * @param  {Function} fn function to execute later.
     */
    req.nextTick = typeof setTimeout !== 'undefined' ? function (fn) {
        setTimeout(fn, 4);
    } : function (fn) { fn(); };

    /**
     * Export require as a global, but only if it does not already exist.
     */
    if (!require) {
        require = req;
    }

    req.version = version;

    //Used to filter out dependencies that are already paths.
    req.jsExtRegExp = /^\/|:|\?|\.js$/;
    req.isBrowser = isBrowser;
    s = req.s = {
        contexts: contexts,
        newContext: newContext
    };

    //Create default context.
    req({});

    //Exports some context-sensitive methods on global require.
    each([
        'toUrl',
        'undef',
        'defined',
        'specified'
    ], function (prop) {
        //Reference from contexts instead of early binding to default context,
        //so that during builds, the latest instance of the default context
        //with its config gets used.
        req[prop] = function () {
            var ctx = contexts[defContextName];
            return ctx.require[prop].apply(ctx, arguments);
        };
    });

    if (isBrowser) {
        head = s.head = document.getElementsByTagName('head')[0];
        //If BASE tag is in play, using appendChild is a problem for IE6.
        //When that browser dies, this can be removed. Details in this jQuery bug:
        //http://dev.jquery.com/ticket/2709
        baseElement = document.getElementsByTagName('base')[0];
        if (baseElement) {
            head = s.head = baseElement.parentNode;
        }
    }

    /**
     * Any errors that require explicitly generates will be passed to this
     * function. Intercept/override it if you want custom error handling.
     * @param {Error} err the error object.
     */
    req.onError = defaultOnError;

    /**
     * Creates the node for the load command. Only used in browser envs.
     */
    req.createNode = function (config, moduleName, url) {
        var node = config.xhtml ?
                document.createElementNS('http://www.w3.org/1999/xhtml', 'html:script') :
                document.createElement('script');
        node.type = config.scriptType || 'text/javascript';
        node.charset = 'utf-8';
        node.async = true;
        return node;
    };

    /**
     * Does the request to load a module for the browser case.
     * Make this a separate function to allow other environments
     * to override it.
     *
     * @param {Object} context the require context to find state.
     * @param {String} moduleName the name of the module.
     * @param {Object} url the URL to the module.
     */
    req.load = function (context, moduleName, url) {
        var config = (context && context.config) || {},
            node;
        if (isBrowser) {
            //In the browser so use a script tag
            node = req.createNode(config, moduleName, url);

            node.setAttribute('data-requirecontext', context.contextName);
            node.setAttribute('data-requiremodule', moduleName);

            //Set up load listener. Test attachEvent first because IE9 has
            //a subtle issue in its addEventListener and script onload firings
            //that do not match the behavior of all other browsers with
            //addEventListener support, which fire the onload event for a
            //script right after the script execution. See:
            //https://connect.microsoft.com/IE/feedback/details/648057/script-onload-event-is-not-fired-immediately-after-script-execution
            //UNFORTUNATELY Opera implements attachEvent but does not follow the script
            //script execution mode.
            if (node.attachEvent &&
                    //Check if node.attachEvent is artificially added by custom script or
                    //natively supported by browser
                    //read https://github.com/jrburke/requirejs/issues/187
                    //if we can NOT find [native code] then it must NOT natively supported.
                    //in IE8, node.attachEvent does not have toString()
                    //Note the test for "[native code" with no closing brace, see:
                    //https://github.com/jrburke/requirejs/issues/273
                    !(node.attachEvent.toString && node.attachEvent.toString().indexOf('[native code') < 0) &&
                    !isOpera) {
                //Probably IE. IE (at least 6-8) do not fire
                //script onload right after executing the script, so
                //we cannot tie the anonymous define call to a name.
                //However, IE reports the script as being in 'interactive'
                //readyState at the time of the define call.
                useInteractive = true;

                node.attachEvent('onreadystatechange', context.onScriptLoad);
                //It would be great to add an error handler here to catch
                //404s in IE9+. However, onreadystatechange will fire before
                //the error handler, so that does not help. If addEventListener
                //is used, then IE will fire error before load, but we cannot
                //use that pathway given the connect.microsoft.com issue
                //mentioned above about not doing the 'script execute,
                //then fire the script load event listener before execute
                //next script' that other browsers do.
                //Best hope: IE10 fixes the issues,
                //and then destroys all installs of IE 6-9.
                //node.attachEvent('onerror', context.onScriptError);
            } else {
                node.addEventListener('load', context.onScriptLoad, false);
                node.addEventListener('error', context.onScriptError, false);
            }
            node.src = url;

            //For some cache cases in IE 6-8, the script executes before the end
            //of the appendChild execution, so to tie an anonymous define
            //call to the module name (which is stored on the node), hold on
            //to a reference to this node, but clear after the DOM insertion.
            currentlyAddingScript = node;
            if (baseElement) {
                head.insertBefore(node, baseElement);
            } else {
                head.appendChild(node);
            }
            currentlyAddingScript = null;

            return node;
        } else if (isWebWorker) {
            try {
                //In a web worker, use importScripts. This is not a very
                //efficient use of importScripts, importScripts will block until
                //its script is downloaded and evaluated. However, if web workers
                //are in play, the expectation that a build has been done so that
                //only one script needs to be loaded anyway. This may need to be
                //reevaluated if other use cases become common.
                importScripts(url);

                //Account for anonymous modules
                context.completeLoad(moduleName);
            } catch (e) {
                context.onError(makeError('importscripts',
                                'importScripts failed for ' +
                                    moduleName + ' at ' + url,
                                e,
                                [moduleName]));
            }
        }
    };

    function getInteractiveScript() {
        if (interactiveScript && interactiveScript.readyState === 'interactive') {
            return interactiveScript;
        }

        eachReverse(scripts(), function (script) {
            if (script.readyState === 'interactive') {
                return (interactiveScript = script);
            }
        });
        return interactiveScript;
    }

    //Look for a data-main script attribute, which could also adjust the baseUrl.
    if (isBrowser && !cfg.skipDataMain) {
        //Figure out baseUrl. Get it from the script tag with require.js in it.
        eachReverse(scripts(), function (script) {
            //Set the 'head' where we can append children by
            //using the script's parent.
            if (!head) {
                head = script.parentNode;
            }

            //Look for a data-main attribute to set main script for the page
            //to load. If it is there, the path to data main becomes the
            //baseUrl, if it is not already set.
            dataMain = script.getAttribute('data-main');
            if (dataMain) {
                //Preserve dataMain in case it is a path (i.e. contains '?')
                mainScript = dataMain;

                //Set final baseUrl if there is not already an explicit one.
                if (!cfg.baseUrl) {
                    //Pull off the directory of data-main for use as the
                    //baseUrl.
                    src = mainScript.split('/');
                    mainScript = src.pop();
                    subPath = src.length ? src.join('/')  + '/' : './';

                    cfg.baseUrl = subPath;
                }

                //Strip off any trailing .js since mainScript is now
                //like a module name.
                mainScript = mainScript.replace(jsSuffixRegExp, '');

                 //If mainScript is still a path, fall back to dataMain
                if (req.jsExtRegExp.test(mainScript)) {
                    mainScript = dataMain;
                }

                //Put the data-main script in the files to load.
                cfg.deps = cfg.deps ? cfg.deps.concat(mainScript) : [mainScript];

                return true;
            }
        });
    }

    /**
     * The function that handles definitions of modules. Differs from
     * require() in that a string for the module should be the first argument,
     * and the function to execute after dependencies are loaded should
     * return a value to define the module corresponding to the first argument's
     * name.
     */
    define = function (name, deps, callback) {
        var node, context;

        //Allow for anonymous modules
        if (typeof name !== 'string') {
            //Adjust args appropriately
            callback = deps;
            deps = name;
            name = null;
        }

        //This module may not have dependencies
        if (!isArray(deps)) {
            callback = deps;
            deps = null;
        }

        //If no name, and callback is a function, then figure out if it a
        //CommonJS thing with dependencies.
        if (!deps && isFunction(callback)) {
            deps = [];
            //Remove comments from the callback string,
            //look for require calls, and pull them into the dependencies,
            //but only if there are function args.
            if (callback.length) {
                callback
                    .toString()
                    .replace(commentRegExp, '')
                    .replace(cjsRequireRegExp, function (match, dep) {
                        deps.push(dep);
                    });

                //May be a CommonJS thing even without require calls, but still
                //could use exports, and module. Avoid doing exports and module
                //work though if it just needs require.
                //REQUIRES the function to expect the CommonJS variables in the
                //order listed below.
                deps = (callback.length === 1 ? ['require'] : ['require', 'exports', 'module']).concat(deps);
            }
        }

        //If in IE 6-8 and hit an anonymous define() call, do the interactive
        //work.
        if (useInteractive) {
            node = currentlyAddingScript || getInteractiveScript();
            if (node) {
                if (!name) {
                    name = node.getAttribute('data-requiremodule');
                }
                context = contexts[node.getAttribute('data-requirecontext')];
            }
        }

        //Always save off evaluating the def call until the script onload handler.
        //This allows multiple modules to be in a file without prematurely
        //tracing dependencies, and allows for anonymous module support,
        //where the module name is not known until the script onload event
        //occurs. If no context, use the global queue, and get it processed
        //in the onscript load callback.
        (context ? context.defQueue : globalDefQueue).push([name, deps, callback]);
    };

    define.amd = {
        jQuery: true
    };


    /**
     * Executes the text. Normally just uses eval, but can be modified
     * to use a better, environment-specific call. Only used for transpiling
     * loader plugins, not for plain JS modules.
     * @param {String} text the text to execute/evaluate.
     */
    req.exec = function (text) {
        /*jslint evil: true */
        return eval(text);
    };

    //Set up with config info.
    req(cfg);
}(this));

define("../node_modules/requirejs/require", function(){});

(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

/**
 * This is the web browser implementation of `debug()`.
 *
 * Expose `debug()` as the module.
 */

window.debug = exports = module.exports = require('./debug');
exports.log = log;
exports.formatArgs = formatArgs;
exports.save = save;
exports.load = load;
exports.useColors = useColors;

/**
 * Use chrome.storage.local if we are in an app
 */

var storage;

if (typeof chrome !== 'undefined' && typeof chrome.storage !== 'undefined')
  storage = chrome.storage.local;
else
  storage = localstorage();

/**
 * Colors.
 */

exports.colors = [
  'lightseagreen',
  'forestgreen',
  'goldenrod',
  'dodgerblue',
  'darkorchid',
  'crimson'
];

/**
 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
 * and the Firebug extension (any Firefox version) are known
 * to support "%c" CSS customizations.
 *
 * TODO: add a `localStorage` variable to explicitly enable/disable colors
 */

function useColors() {
  // is webkit? http://stackoverflow.com/a/16459606/376773
  return ('WebkitAppearance' in document.documentElement.style) ||
    // is firebug? http://stackoverflow.com/a/398120/376773
    (window.console && (console.firebug || (console.exception && console.table))) ||
    // is firefox >= v31?
    // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
    (navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31);
}

/**
 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
 */

exports.formatters.j = function(v) {
  return JSON.stringify(v);
};


/**
 * Colorize log arguments if enabled.
 *
 * @api public
 */

function formatArgs() {
  var args = arguments;
  var useColors = this.useColors;

  args[0] = (useColors ? '%c' : '')
    + this.namespace
    + (useColors ? ' %c' : ' ')
    + args[0]
    + (useColors ? '%c ' : ' ')
    + '+' + exports.humanize(this.diff);

  if (!useColors) return args;

  var c = 'color: ' + this.color;
  args = [args[0], c, 'color: inherit'].concat(Array.prototype.slice.call(args, 1));

  // the final "%c" is somewhat tricky, because there could be other
  // arguments passed either before or after the %c, so we need to
  // figure out the correct index to insert the CSS into
  var index = 0;
  var lastC = 0;
  args[0].replace(/%[a-z%]/g, function(match) {
    if ('%%' === match) return;
    index++;
    if ('%c' === match) {
      // we only are interested in the *last* %c
      // (the user may have provided their own)
      lastC = index;
    }
  });

  args.splice(lastC, 0, c);
  return args;
}

/**
 * Invokes `console.log()` when available.
 * No-op when `console.log` is not a "function".
 *
 * @api public
 */

function log() {
  // this hackery is required for IE8/9, where
  // the `console.log` function doesn't have 'apply'
  return 'object' === typeof console
    && console.log
    && Function.prototype.apply.call(console.log, console, arguments);
}

/**
 * Save `namespaces`.
 *
 * @param {String} namespaces
 * @api private
 */

function save(namespaces) {
  try {
    if (null == namespaces) {
      storage.removeItem('debug');
    } else {
      storage.debug = namespaces;
    }
  } catch(e) {}
}

/**
 * Load `namespaces`.
 *
 * @return {String} returns the previously persisted debug modes
 * @api private
 */

function load() {
  var r;
  try {
    r = storage.debug;
  } catch(e) {}
  return r;
}

/**
 * Enable namespaces listed in `localStorage.debug` initially.
 */

exports.enable(load());

/**
 * Localstorage attempts to return the localstorage.
 *
 * This is necessary because safari throws
 * when a user disables cookies/localstorage
 * and you attempt to access it.
 *
 * @return {LocalStorage}
 * @api private
 */

function localstorage(){
  try {
    return window.localStorage;
  } catch (e) {}
}

},{"./debug":2}],2:[function(require,module,exports){

/**
 * This is the common logic for both the Node.js and web browser
 * implementations of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = debug;
exports.coerce = coerce;
exports.disable = disable;
exports.enable = enable;
exports.enabled = enabled;
exports.humanize = require('ms');

/**
 * The currently active debug mode names, and names to skip.
 */

exports.names = [];
exports.skips = [];

/**
 * Map of special "%n" handling functions, for the debug "format" argument.
 *
 * Valid key names are a single, lowercased letter, i.e. "n".
 */

exports.formatters = {};

/**
 * Previously assigned color.
 */

var prevColor = 0;

/**
 * Previous log timestamp.
 */

var prevTime;

/**
 * Select a color.
 *
 * @return {Number}
 * @api private
 */

function selectColor() {
  return exports.colors[prevColor++ % exports.colors.length];
}

/**
 * Create a debugger with the given `namespace`.
 *
 * @param {String} namespace
 * @return {Function}
 * @api public
 */

function debug(namespace) {

  // define the `disabled` version
  function disabled() {
  }
  disabled.enabled = false;

  // define the `enabled` version
  function enabled() {

    var self = enabled;

    // set `diff` timestamp
    var curr = +new Date();
    var ms = curr - (prevTime || curr);
    self.diff = ms;
    self.prev = prevTime;
    self.curr = curr;
    prevTime = curr;

    // add the `color` if not set
    if (null == self.useColors) self.useColors = exports.useColors();
    if (null == self.color && self.useColors) self.color = selectColor();

    var args = Array.prototype.slice.call(arguments);

    args[0] = exports.coerce(args[0]);

    if ('string' !== typeof args[0]) {
      // anything else let's inspect with %o
      args = ['%o'].concat(args);
    }

    // apply any `formatters` transformations
    var index = 0;
    args[0] = args[0].replace(/%([a-z%])/g, function(match, format) {
      // if we encounter an escaped % then don't increase the array index
      if (match === '%%') return match;
      index++;
      var formatter = exports.formatters[format];
      if ('function' === typeof formatter) {
        var val = args[index];
        match = formatter.call(self, val);

        // now we need to remove `args[index]` since it's inlined in the `format`
        args.splice(index, 1);
        index--;
      }
      return match;
    });

    if ('function' === typeof exports.formatArgs) {
      args = exports.formatArgs.apply(self, args);
    }
    var logFn = enabled.log || exports.log || console.log.bind(console);
    logFn.apply(self, args);
  }
  enabled.enabled = true;

  var fn = exports.enabled(namespace) ? enabled : disabled;

  fn.namespace = namespace;

  return fn;
}

/**
 * Enables a debug mode by namespaces. This can include modes
 * separated by a colon and wildcards.
 *
 * @param {String} namespaces
 * @api public
 */

function enable(namespaces) {
  exports.save(namespaces);

  var split = (namespaces || '').split(/[\s,]+/);
  var len = split.length;

  for (var i = 0; i < len; i++) {
    if (!split[i]) continue; // ignore empty strings
    namespaces = split[i].replace(/\*/g, '.*?');
    if (namespaces[0] === '-') {
      exports.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
    } else {
      exports.names.push(new RegExp('^' + namespaces + '$'));
    }
  }
}

/**
 * Disable debug output.
 *
 * @api public
 */

function disable() {
  exports.enable('');
}

/**
 * Returns true if the given mode name is enabled, false otherwise.
 *
 * @param {String} name
 * @return {Boolean}
 * @api public
 */

function enabled(name) {
  var i, len;
  for (i = 0, len = exports.skips.length; i < len; i++) {
    if (exports.skips[i].test(name)) {
      return false;
    }
  }
  for (i = 0, len = exports.names.length; i < len; i++) {
    if (exports.names[i].test(name)) {
      return true;
    }
  }
  return false;
}

/**
 * Coerce `val`.
 *
 * @param {Mixed} val
 * @return {Mixed}
 * @api private
 */

function coerce(val) {
  if (val instanceof Error) return val.stack || val.message;
  return val;
}

},{"ms":3}],3:[function(require,module,exports){
/**
 * Helpers.
 */

var s = 1000;
var m = s * 60;
var h = m * 60;
var d = h * 24;
var y = d * 365.25;

/**
 * Parse or format the given `val`.
 *
 * Options:
 *
 *  - `long` verbose formatting [false]
 *
 * @param {String|Number} val
 * @param {Object} options
 * @return {String|Number}
 * @api public
 */

module.exports = function(val, options){
  options = options || {};
  if ('string' == typeof val) return parse(val);
  return options.long
    ? long(val)
    : short(val);
};

/**
 * Parse the given `str` and return milliseconds.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function parse(str) {
  var match = /^((?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|years?|yrs?|y)?$/i.exec(str);
  if (!match) return;
  var n = parseFloat(match[1]);
  var type = (match[2] || 'ms').toLowerCase();
  switch (type) {
    case 'years':
    case 'year':
    case 'yrs':
    case 'yr':
    case 'y':
      return n * y;
    case 'days':
    case 'day':
    case 'd':
      return n * d;
    case 'hours':
    case 'hour':
    case 'hrs':
    case 'hr':
    case 'h':
      return n * h;
    case 'minutes':
    case 'minute':
    case 'mins':
    case 'min':
    case 'm':
      return n * m;
    case 'seconds':
    case 'second':
    case 'secs':
    case 'sec':
    case 's':
      return n * s;
    case 'milliseconds':
    case 'millisecond':
    case 'msecs':
    case 'msec':
    case 'ms':
      return n;
  }
}

/**
 * Short format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function short(ms) {
  if (ms >= d) return Math.round(ms / d) + 'd';
  if (ms >= h) return Math.round(ms / h) + 'h';
  if (ms >= m) return Math.round(ms / m) + 'm';
  if (ms >= s) return Math.round(ms / s) + 's';
  return ms + 'ms';
}

/**
 * Long format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function long(ms) {
  return plural(ms, d, 'day')
    || plural(ms, h, 'hour')
    || plural(ms, m, 'minute')
    || plural(ms, s, 'second')
    || ms + ' ms';
}

/**
 * Pluralization helper.
 */

function plural(ms, n, name) {
  if (ms < n) return;
  if (ms < n * 1.5) return Math.floor(ms / n) + ' ' + name;
  return Math.ceil(ms / n) + ' ' + name + 's';
}

},{}]},{},[1]);

define("debug", function(){});

/*globals define, debug*/
/*jshint node:true*/
/**
 * @author pmeijer / https://github.com/pmeijer
 */

define('js/logger',['debug'], function (_debug) {
    
    // Separate namespaces using ',' a leading '-' will disable the namespace.
    // Each part takes a regex.
    //      ex: localStorage.debug = '*,-socket\.io*,-engine\.io*'
    //      will log all but socket.io and engine.io
    function createLogger(name, options) {
        var log = typeof debug === 'undefined' ? _debug(name) : debug(name),
            level,
            levels = {
                silly: 0,
                input: 1,
                verbose: 2,
                prompt: 3,
                debug: 4,
                info: 5,
                data: 6,
                help: 7,
                warn: 8,
                error: 9
            };
        if (!options) {
            throw new Error('options required in logger');
        }
        if (options.hasOwnProperty('level') === false) {
            throw new Error('options.level required in logger');
        }
        level = levels[options.level];
        if (typeof level === 'undefined') {
            level = levels.info;
        }

        log.debug = function () {
            if (log.enabled && level <= levels.debug) {
                if (console.debug) {
                    log.log = console.debug.bind(console);
                } else {
                    log.log = console.log.bind(console);
                }
                log.apply(this, arguments);
            }
        };
        log.info = function () {
            if (log.enabled && level <= levels.info) {
                log.log = console.info.bind(console);
                log.apply(this, arguments);
            }
        };
        log.warn = function () {
            if (log.enabled && level <= levels.warn) {
                log.log = console.warn.bind(console);
                log.apply(this, arguments);
            }
        };
        log.error = function () {
            if (log.enabled && level <= levels.error) {
                log.log = console.error.bind(console);
                log.apply(this, arguments);
            } else {
                console.error.apply(console, arguments);
            }
        };

        log.fork = function (forkName, useForkName) {
            forkName = useForkName ? forkName : name + ':' + forkName;
            return createLogger(forkName, options);
        };

        log.forkWithOptions = function (_name, _options) {
            return createLogger(_name, _options);
        };

        return log;
    }

    function createWithGmeConfig(name, gmeConfig) {
        return createLogger(name, gmeConfig.client.log);
    }

    return {
        create: createLogger,
        createWithGmeConfig: createWithGmeConfig
    };
});
/*globals define*/
/*jshint node:true, browser: true*/
/**
 * @author pmeijer / https://github.com/pmeijer
 */

define('common/storage/constants',[], function () {
    
    return {

        // Database related
        MONGO_ID: '_id',
        PROJECT_INFO_ID: '*info*',
        EMPTY_PROJECT_DATA: 'empty',

        // Socket IO
        DATABASE_ROOM: 'database',
        ROOM_DIVIDER: '%',
        CONNECTED: 'CONNECTED',
        DISCONNECTED: 'DISCONNECTED',
        RECONNECTED: 'RECONNECTED',

        // Branch status
        SYNCH: 'SYNCH',
        FORKED: 'FORKED',
        MERGED: 'MERGED',

        // Events
        PROJECT_DELETED: 'PROJECT_DELETED',
        PROJECT_CREATED: 'PROJECT_CREATED',

        BRANCH_DELETED: 'BRANCH_DELETED',
        BRANCH_CREATED: 'BRANCH_CREATED',
        BRANCH_HASH_UPDATED: 'BRANCH_HASH_UPDATED',

        BRANCH_UPDATED: 'BRANCH_UPDATED'
    };
});

/*globals define*/
/*jshint browser: true, node:true*/
/**
 * Provides watching-functionality of the database and specific projects.
 * Keeps a state of the registered watchers.
 *
 * @author pmeijer / https://github.com/pmeijer
 */

define('common/storage/storageclasses/watchers',['common/storage/constants'], function (CONSTANTS) {
    

    function StorageWatcher(webSocket, logger, gmeConfig) {
        // watcher counters determining when to join/leave a room on the sever
        this.watchers = {
            database: 0,
            projects: {}
        };
        this.webSocket = webSocket;
        this.logger = this.logger || logger.fork('storage');
        this.gmeConfig = gmeConfig;
        this.logger.debug('StorageWatcher ctor');
        this.connected = false;
    }

    StorageWatcher.prototype.watchDatabase = function (eventHandler, callback) {
        this.logger.debug('watchDatabase - handler added');
        this.webSocket.addEventListener(CONSTANTS.PROJECT_DELETED, eventHandler);
        this.webSocket.addEventListener(CONSTANTS.PROJECT_CREATED, eventHandler);
        this.watchers.database += 1;
        this.logger.debug('Nbr of database watchers:', this.watchers.database);
        if (this.watchers.database === 1) {
            this.logger.debug('First watcher will enter database room.');
            this.webSocket.watchDatabase({join: true}, callback);
        } else {
            callback(null);
        }
    };

    StorageWatcher.prototype.unwatchDatabase = function (eventHandler, callback) {
        this.logger.debug('unwatchDatabase - handler will be removed');
        this.logger.debug('Nbr of database watchers (before removal):', this.watchers.database);
        this.webSocket.removeEventListener(CONSTANTS.PROJECT_DELETED, eventHandler);
        this.webSocket.removeEventListener(CONSTANTS.PROJECT_CREATED, eventHandler);
        this.watchers.database -= 1;
        if (this.watchers.database === 0) {
            this.logger.debug('No more watchers will exit database room.');
            if (this.connected) {
                this.webSocket.watchDatabase({join: false}, callback);
            } else {
                callback(null);
            }
        } else if (this.watchers.database < 0) {
            this.logger.error('Number of database watchers became negative!');
            callback('Number of database watchers became negative!');
        } else {
            callback(null);
        }
    };

    StorageWatcher.prototype.watchProject = function (projectName, eventHandler, callback) {
        this.logger.debug('watchProject - handler added for project', projectName);
        this.webSocket.addEventListener(CONSTANTS.BRANCH_DELETED + projectName, eventHandler);
        this.webSocket.addEventListener(CONSTANTS.BRANCH_CREATED + projectName, eventHandler);
        this.webSocket.addEventListener(CONSTANTS.BRANCH_HASH_UPDATED + projectName, eventHandler);

        this.watchers.projects[projectName] = this.watchers.projects.hasOwnProperty(projectName) ?
        this.watchers.projects[projectName] + 1 : 1;
        this.logger.debug('Nbr of watchers for project:', projectName, this.watchers.projects[projectName]);
        if (this.watchers.projects[projectName] === 1) {
            this.logger.debug('First watcher will enter project room:', projectName);
            this.webSocket.watchProject({projectName: projectName, join: true}, callback);
        } else {
            callback(null);
        }
    };

    StorageWatcher.prototype.unwatchProject = function (projectName, eventHandler, callback) {
        this.logger.debug('unwatchProject - handler will be removed', projectName);
        this.logger.debug('Nbr of database watchers (before removal):', projectName,
            this.watchers.projects[projectName]);
        this.webSocket.removeEventListener(CONSTANTS.BRANCH_DELETED + projectName, eventHandler);
        this.webSocket.removeEventListener(CONSTANTS.BRANCH_CREATED + projectName, eventHandler);
        this.webSocket.removeEventListener(CONSTANTS.BRANCH_HASH_UPDATED + projectName, eventHandler);

        this.watchers.projects[projectName] = this.watchers.projects.hasOwnProperty(projectName) ?
        this.watchers.projects[projectName] - 1 : -1;
        if (this.watchers.projects[projectName] === 0) {
            this.logger.debug('No more watchers will exit project room:', projectName);
            delete this.watchers.projects[projectName];
            if (this.connected) {
                this.webSocket.watchProject({projectName: projectName, join: false}, callback);
            } else {
                callback(null);
            }
        } else if (this.watchers.database < 0) {
            this.logger.error('Number of project watchers became negative!:', projectName);
            callback('Number of project watchers became negative!');
        } else {
            callback(null);
        }
    };

    StorageWatcher.prototype._rejoinWatcherRooms = function () {
        var self = this,
            projectName,
            callback = function (err) {
                //TODO: Add a callback here too.
                if (err) {
                    self.logger.error('problems rejoining watcher rooms', err);
                }
            };
        this.logger.debug('rejoinWatcherRooms');
        if (this.watchers.database > 0) {
            this.logger.debug('Rejoining database room.');
            this.webSocket.watchDatabase({join: true}, callback);
        }
        for (projectName in this.watchers.projects) {
            if (this.watchers.projects.hasOwnProperty(projectName) && this.watchers.projects[projectName] > 0) {
                this.logger.debug('Rejoining project room', projectName, this.watchers.projects[projectName]);
                this.webSocket.watchProject({projectName: projectName, join: true}, callback);
            }
        }
    };

    return StorageWatcher;
});
/*globals define*/
/*jshint browser: true, node:true*/
/**
 * TODO: Come up with an appropriate name for this.
 * TODO: Proper implementation needed, e.g. error handling.
 *
 * Provides REST-like functionality of the database.
 *
 * @author pmeijer / https://github.com/pmeijer
 */

define('common/storage/storageclasses/simpleapi',['common/storage/storageclasses/watchers'], function (StorageWatcher) {
    

    /**
     *
     * @param webSocket
     * @param logger
     * @param gmeConfig
     * @constructor
     * @class
     */
    function StorageSimpleAPI(webSocket, logger, gmeConfig) {
        // watcher counters determining when to join/leave a room on the sever
        this.logger = this.logger || logger.fork('storage');
        StorageWatcher.call(this, webSocket, logger, gmeConfig);
        this.webSocket = webSocket;
        this.gmeConfig = gmeConfig;
        this.logger.debug('StorageSimpleAPI ctor');
    }

    StorageSimpleAPI.prototype = Object.create(StorageWatcher.prototype);
    StorageSimpleAPI.prototype.constructor = StorageSimpleAPI;

    /**
     * Callback for getProjectNames.
     *
     * @callback StorageSimpleAPI~getProjectNamesCallback
     * @param {string} err - error string.
     * @param {string[]} projectNames - Names of all projects the user has at least read-access to.
     */

    /**
     * Retrieves all the project names where the user has at least read access.
     *
     * @param {StorageSimpleAPI~getProjectNamesCallback} callback
     */
    StorageSimpleAPI.prototype.getProjectNames = function (callback) {
        var data = {};
        this.logger.debug('invoking getProjectNames', data);
        this.webSocket.getProjectNames(data, callback);
    };

    /**
     * Callback for getProjects.
     *
     * @callback StorageSimpleAPI~getProjectsCallback
     * @param {string} err - error string.
     * @param {{object[]} projects - All projects in the database.
     * @example
     * // projects is of the form
     * // [{ name: 'ProjectName', read: true, write: false, delete: false} ]
     */

    /**
     * Retrieves all the access info for all projects.
     *
     * @param {StorageSimpleAPI~getProjectsCallback} callback
     */
    StorageSimpleAPI.prototype.getProjects = function (callback) {
        var data = {};
        this.logger.debug('invoking getProjects', data);
        this.webSocket.getProjects(data, callback);
    };

    /**
     * Callback for getProjectsAndBranches.
     *
     * @callback StorageSimpleAPI~getProjectsAndBranches
     * @param {string} err - error string.
     * @param {{object[]} projectsWithBranches - Projects the user has at least read-access to.
     * @example
     * // projectsWithBranches is of the form
     * // [{
     * //    name: 'ProjectName',
     * //    read: true, //will always be true
     * //    write: false,
     * //    delete: false
     * //    branches: {
     * //      master: '#validHash',
     * //      b1: '#validHashtoo'
     * //    }
     * // }]
     */

    /**
     * Retrieves all the access info for all projects.
     *
     * @param {StorageSimpleAPI~getProjectsAndBranches} callback
     */
    StorageSimpleAPI.prototype.getProjectsAndBranches = function (callback) {
        var data = {};
        this.logger.debug('invoking getProjectsAndBranches', data);
        this.webSocket.getProjectsAndBranches(data, callback);
    };


    StorageSimpleAPI.prototype.getBranches = function (projectName, callback) {
        var data = {
            projectName: projectName
        };
        this.logger.debug('invoking getBranches', data);
        this.webSocket.getBranches(data, callback);
    };

    StorageSimpleAPI.prototype.getCommits = function (projectName, before, number, callback) {
        var data = {
            projectName: projectName,
            before: before,
            number: number
        };
        this.logger.debug('invoking getCommits', data);
        this.webSocket.getCommits(data, callback);
    };

    StorageSimpleAPI.prototype.getLatestCommitData = function (projectName, branchName, callback) {
        var data = {
            projectName: projectName,
            branchName: branchName
        };
        this.logger.debug('invoking getLatestCommitData', data);
        this.webSocket.getLatestCommitData(data, callback);
    };

    // Setters
    //StorageSimpleAPI.prototype.createProject = function (projectName, parameters, callback) {
    //    var data = {
    //        projectName: projectName,
    //        parameters: parameters
    //    };
    //
    //    this.logger.debug('invoking createProject');
    //    this.webSocket.createProject(data, callback);
    //};

    StorageSimpleAPI.prototype.deleteProject = function (projectName, callback) {
        var data = {
            projectName: projectName
        };
        this.logger.debug('invoking deleteProject', data);
        this.webSocket.deleteProject(data, callback);
    };

    StorageSimpleAPI.prototype.createBranch = function (projectName, branchName, newHash, callback) {
        var data = {
            projectName: projectName,
            branchName: branchName,
            newHash: newHash,
            oldHash: ''
        };
        this.logger.debug('invoking createBranch', data);
        this.webSocket.setBranchHash(data, callback);
    };

    StorageSimpleAPI.prototype.deleteBranch = function (projectName, branchName, oldHash, callback) {
        var data = {
            projectName: projectName,
            branchName: branchName,
            newHash: '',
            oldHash: oldHash
        };
        this.logger.debug('invoking deleteBranch', data);
        this.webSocket.setBranchHash(data, callback);
    };

    //temporary simple request and result functions
    StorageSimpleAPI.prototype.simpleRequest = function (parameters, callback) {
        this.logger.debug('invoking simpleRequest', parameters);
        this.webSocket.simpleRequest(parameters, callback);
    };

    StorageSimpleAPI.prototype.simpleResult = function (resultId, callback) {
        this.logger.debug('invoking simpleResult', resultId);
        this.webSocket.simpleResult(resultId, callback);
    };

    StorageSimpleAPI.prototype.simpleQuery = function (workerId, parameters, callback) {
        this.logger.debug('invoking simpleQuery; workerId, parameters', workerId, parameters);
        this.webSocket.simpleQuery(workerId, parameters, callback);
    };

    return StorageSimpleAPI;
});
/*globals define*/
/*jshint browser: true, node:true*/
/**
 * Provides functionality (used by the project-cache) for loading objects.
 *
 * To avoid multiple round-trips to the server the loadObject requests are put in a bucket
 * that is loaded when the bucket is full (gmeConfig.storage.loadBucketSize) or when a
 * timeout is triggered (gmeConfig.storage.loadBucketTimer).
 *
 * @author pmeijer / https://github.com/pmeijer
 */

define('common/storage/storageclasses/objectloaders',['common/storage/storageclasses/simpleapi'], function (SimpleAPI) {
    

    function StorageObjectLoaders(webSocket, logger, gmeConfig) {
        // watcher counters determining when to join/leave a room on the sever
        this.logger = this.logger || logger.fork('storage');
        SimpleAPI.call(this, webSocket, logger, gmeConfig);
        this.webSocket = webSocket;
        this.gmeConfig = gmeConfig;
        // Bucket for loading objects
        this.loadBucket = [];
        this.loadBucketSize = 0;
        this.loadBucketTimer = null;
        this.logger.debug('StorageObjectLoaders ctor');
    }

    StorageObjectLoaders.prototype = Object.create(SimpleAPI.prototype);
    StorageObjectLoaders.prototype.constructor = StorageObjectLoaders;

    // Getters
    StorageObjectLoaders.prototype.loadObject = function (projectName, hash, callback) {
        var self = this;
        this.logger.debug('loadObject', projectName, hash);

        self.loadBucket.push({projectName: projectName, hash: hash, cb: callback});
        self.loadBucketSize += 1;

        function resetBucketAndLoadObjects() {
            var myBucket = self.loadBucket;
            self.loadBucket = [];
            self.loadBucketTimer = null;
            self.loadBucketSize = 0;
            self.loadObjects(projectName, myBucket);
        }

        if (self.loadBucketSize === 1) {
            self.logger.debug('loadBucket was empty starting timer [ms]', self.gmeConfig.storage.loadBucketTimer);
            self.loadBucketTimer = setTimeout(function () {
                self.logger.debug('loadBucketTimer triggered, bucketSize:', self.loadBucketSize);
                resetBucketAndLoadObjects();
            }, self.gmeConfig.storage.loadBucketTimer);
        }
        
        if (self.loadBucketSize === self.gmeConfig.storage.loadBucketSize) {
            self.logger.debug('loadBuckSize reached will loadObjects, bucketSize:', self.loadBucketSize);
            clearTimeout(self.loadBucketTimer);
            resetBucketAndLoadObjects();
        }
    };

    StorageObjectLoaders.prototype.loadObjects = function (projectName, hashedObjects) {
        var self = this,
            hashes = {},
            data,
            i;
        for (i = 0; i < hashedObjects.length; i++) {
            hashes[hashedObjects[i].hash] = true;
        }
        hashes = Object.keys(hashes);
        data = {
            hashes: hashes,
            projectName: projectName
        };

        this.webSocket.loadObjects(data, function (err, result) {
            if (err) {
                throw new Error(err);
            }
            self.logger.debug('loadObjects returned', result);
            for (i = 0; i < hashedObjects.length; i++) {
                if (typeof result[hashedObjects[i].hash] === 'string') {
                    self.logger.error(result[hashedObjects[i].hash]);
                    hashedObjects[i].cb(result[hashedObjects[i].hash]);
                } else {
                    hashedObjects[i].cb(err, result[hashedObjects[i].hash]);
                }
            }
        });
    };

    return StorageObjectLoaders;
});

/*globals define*/
/*jshint node: true, browser: true*/

/**
 * @author mmaroti / https://github.com/mmaroti
 */


define('common/util/assert',[],function () {
    

    var assert = function (cond, msg) {
        if (!cond) {
            var error = new Error(msg || 'ASSERT failed');

            if (typeof TESTING === 'undefined') {
                console.log('Throwing', error.stack);
                console.log();
            }

            throw error;
        }
    };

    return assert;
});

/*globals define*/
/*jshint browser: true, node:true*/
/**
 * This class (extracted functionality from cache implemented by mmaroti) caches objects associated
 * with a project.
 *
 * @author pmeijer / https://github.com/pmeijer
 * @author mmaroti / https://github.com/mmaroti
 */

define('common/storage/project/cache',['common/util/assert', 'common/storage/constants'], function (ASSERT, CONSTANTS) {
    
    function ProjectCache(storage, projectName, mainLogger, gmeConfig) {
        var missing = {},
            backup = {},
            cache = {},
            logger = mainLogger.fork('ProjectCache'),
            cacheSize = 0;

        logger.debug('ctor');
        function cacheInsert(key, obj) {
            ASSERT(typeof cache[key] === 'undefined' && obj[CONSTANTS.MONGO_ID] === key);
            logger.debug('cacheInsert', key);

            //deepFreeze(obj);
            cache[key] = obj;

            if (++cacheSize >= gmeConfig.storage.cache) {
                backup = cache;
                cache = {};
                cacheSize = 0;
            }
        }

        this.loadObject = function (key, callback) {
            ASSERT(typeof key === 'string' && typeof callback === 'function');
            logger.debug('loadObject', {metadata: key});

            var obj = cache[key];
            if (typeof obj === 'undefined') {
                obj = backup[key];
                if (typeof obj === 'undefined') {
                    obj = missing[key];
                    if (typeof obj === 'undefined') {
                        obj = [callback];
                        missing[key] = obj;
                        logger.debug('object set to be loaded from storage');
                        storage.loadObject(projectName, key, function (err, obj2) {
                            ASSERT(typeof obj2 === 'object' || typeof obj2 === 'undefined');

                            if (obj.length !== 0) {
                                ASSERT(missing[key] === obj);

                                delete missing[key];
                                if (!err && obj2) {
                                    cacheInsert(key, obj2);
                                }

                                var cb;
                                while ((cb = obj.pop())) {
                                    cb(err, obj2);
                                }
                            }
                        });
                    } else {
                        logger.debug('object was already queued to be loaded');
                        obj.push(callback);
                    }
                    return;
                } else {
                    logger.debug('object was in backup');
                    cacheInsert(key, obj);
                }
            } else {
                logger.debug('object was in cache');
            }

            ASSERT(typeof obj === 'object' && obj !== null && obj[CONSTANTS.MONGO_ID] === key);
            callback(null, obj);
        };

        this.insertObject = function (obj, stackedObjects) {
            ASSERT(typeof obj === 'object' && obj !== null);

            var key = obj[CONSTANTS.MONGO_ID];
            logger.debug('insertObject', {metadata: key});
            ASSERT(typeof key === 'string');

            if (typeof cache[key] !== 'undefined') {
                logger.warn('object inserted was already in cache');
            } else {
                var item = backup[key];
                cacheInsert(key, obj);

                if (typeof item !== 'undefined') {
                    logger.warn('object inserted was already in back-up');
                } else {
                    item = missing[key];
                    if (typeof item !== 'undefined') {
                        delete missing[key];

                        var cb;
                        while ((cb = item.pop())) {
                            cb(null, obj);
                        }
                    }
                }
            }
            if (stackedObjects) {
                stackedObjects[key] = obj;
            }
        };
    }

    return ProjectCache;
});
/*globals define*/
/*jshint browser: true, node:true*/
/**
 * @author pmeijer / https://github.com/pmeijer
 */

define('common/storage/project/branch',['common/storage/constants'], function (CONSTANTS) {
    

    function Branch(name, mainLogger) {
        var self = this,
            logger = mainLogger.fork('Branch:' + name),
            originHash = '',
            localHash = '',
            commitQueue = [],
            updateQueue = [];

        logger.debug('ctor');
        this.name = name;
        this.isOpen = true;

        this.updateHandler = null;
        this.commitHandler = null;

        this.localUpdateHandler = null;

        this.cleanUp = function () {
            self.isOpen = false;
            self.updateHandler = null;
            self.commitHandler = null;
            self.localUpdateHandler = null;

            commitQueue = [];
            updateQueue = [];
        };

        this.getLocalHash = function () {
            return localHash;
        };

        this.getOriginHash = function () {
            return originHash;
        };

        this.updateHashes = function (newLocal, newOrigin) {
            logger.debug('updatingHashes');
            if (newLocal !== null) {
                logger.debug('localHash: old, new', localHash, newLocal);
                localHash = newLocal;
            }
            if (newOrigin !== null) {
                logger.debug('originHash: old, new', originHash, newOrigin);
                originHash = newOrigin;
            }
        };

        this.queueCommit = function (commitData) {
            commitQueue.push(commitData);
            logger.debug('Adding new commit to queue', commitQueue.length);
        };

        this.getFirstCommit = function (shift) {
            var commitData;
            if (shift) {
                commitData = commitQueue.shift();
                logger.debug('Removed commit from queue', commitQueue.length);
            } else {
                commitData = commitQueue[0];
            }

            return commitData;
        };

        this.getCommitQueue = function () {
            return commitQueue;
        };

        this.getCommitsForNewFork = function (upTillCommitHash) {
            var i,
                commitData,
                commitHash,
                commitHashExisted = false,
                subQueue = [];

            logger.debug('getCommitsForNewFork', upTillCommitHash);

            if (commitQueue.length === 0) {
                commitHash = localHash;

                logger.debug('No commits queued will fork from', commitHash);
                upTillCommitHash = upTillCommitHash || commitHash;
                commitHashExisted = upTillCommitHash === commitHash;
            } else {
                upTillCommitHash = upTillCommitHash ||
                    commitQueue[commitQueue.length - 1].commitObject[CONSTANTS.MONGO_ID];
            }

            logger.debug('Will fork up to commitHash', upTillCommitHash);

            // Move over all commit-data up till the chosen commitHash to the fork's queue,
            // except the commit that caused the fork (all its objects are already in the database).
            for (i = 0; i < commitQueue.length; i += 1) {
                commitData = commitQueue[i];
                commitHash = commitData.commitObject[CONSTANTS.MONGO_ID];
                // remove the branchName of the commitData
                delete commitData.branchName;
                if (i !== 0) {
                    subQueue.push(commitData);
                }
                if (commitData.commitObject[CONSTANTS.MONGO_ID] === upTillCommitHash) {
                    // The commitHash from where to fork has been reached.
                    // If any, the rest of the 'pending' commits will not be used.
                    commitHashExisted = true;
                    break;
                }
            }

            if (commitHashExisted === false) {
                logger.error('Could not find the specified commitHash', upTillCommitHash);
                return false;
            }

            return {commitHash: commitHash, queue: subQueue};
        };

        this.queueUpdate = function (updateData) {
            updateQueue.push(updateData);
            logger.debug('Adding new update to queue', updateQueue.length);
        };

        this.getUpdateQueue = function () {
            return updateQueue;
        };

        this.getFirstUpdate = function (shift) {
            var updateData;
            if (shift) {
                updateData = updateQueue.shift();
                logger.debug('Removed update from queue', updateQueue.length);
            } else {
                updateData = updateQueue[0];
            }

            return updateData;
        };
    }

    return Branch;
});
/*globals define*/
/*jshint browser: true, node:true*/
/**
 * @author pmeijer / https://github.com/pmeijer
 */

define('common/storage/project/project',[
    'common/storage/project/cache',
    'common/storage/project/branch',
    'common/storage/constants',
    'common/util/assert'
], function (ProjectCache, Branch, CONSTANTS, ASSERT) {
    

    function Project(name, storage, mainLogger, gmeConfig) {
        this.name = name;
        this.branches = {};
        this.ID_NAME = CONSTANTS.MONGO_ID;

        var self = this,
            logger = mainLogger.fork('Project:' + self.name),
            projectCache = new ProjectCache(storage, self.name, logger, gmeConfig);

        logger.debug('ctor');
        this.getBranch = function (branchName, shouldExist) {

            if (shouldExist === true) {
                ASSERT(this.branches.hasOwnProperty(branchName), 'branch does not exist ' + branchName);
            } else if (shouldExist === false) {
                ASSERT(this.branches.hasOwnProperty(branchName) === false, 'branch already existed ' + branchName);
            }

            if (this.branches.hasOwnProperty(branchName) === false) {
                this.branches[branchName] = new Branch(branchName, logger);
            }

            return this.branches[branchName];
        };

        this.removeBranch = function (branchName) {
            var existed = this.branches.hasOwnProperty(branchName);
            if (existed) {
                delete this.branches[branchName];
            }
            return existed;
        };

        // Functions forwarded to storage.
        this.setBranchHash = function (branchName, newHash, oldHash, callback) {
            storage.setBranchHash(self.name, branchName, newHash, oldHash, callback);
        };

        this.createBranch = function (branchName, newHash, callback) {
            storage.createBranch(self.name, branchName, newHash, callback);
        };

        this.makeCommit = function (branchName, parents, rootHash, coreObjects, msg, callback) {
            return storage.makeCommit(self.name, branchName, parents, rootHash, coreObjects, msg, callback);
        };

        this.getBranches = function (callback) {
            storage.getBranches(self.name, callback);
        };

        this.getCommits = function (before, number, callback) {
            storage.getCommits(self.name, before, number, callback);
        };

        this.getCommonAncestorCommit = function (commitA, commitB, callback) {
            storage.getCommonAncestorCommit(self.name, commitA, commitB, callback);
        };

        // Functions forwarded to project cache.
        this.insertObject = function (obj, stageBucket) {
            projectCache.insertObject(obj, stageBucket);
        };

        this.loadObject = function (key, callback) {
            projectCache.loadObject(key, callback);
        };
    }

    return Project;
});
//jshint ignore: start
//SHA1 in Javascript 862 bytes, MIT License, http://antimatter15.com/
define('common/util/sha1',[],function() {
return function(l){function p(b,a){return b<<a|b>>>32-a}l+="";for(var n=Math,c=[1518500249,1859775393,2400959708,3395469782,1732584193,4023233417,2562383102,271733878,3285377520,4294967295],s=n.ceil(l.length/4)+2,q=n.ceil(s/16),g=[],a=0,h=[],j,d,e,f,m,i,b,k;a<q;a++){g[a]=[];for(k=0;k<16;k++){function o(b,c){return l.charCodeAt(a*64+k*4+b)<<c}g[a][k]=o(0,24)|o(1,16)|o(2,8)|o(3,0)}}i=l.length*8-8;a=q-1;g[a][14]=i/(c[9]+1);g[a][14]=n.floor(g[a][14]);g[a][15]=i&c[9];for(a=0;a<q;a++){for(b=0;b<16;b++)h[b]=g[a][b];for(b=16;b<80;b++)h[b]=p(h[b-3]^h[b-8]^h[b-14]^h[b-16],1);j=c[4];d=c[5];e=c[6];f=c[7];m=c[8];for(b=0;b<80;b++){var r=n.floor(b/20),t=p(j,5)+(r<1?d&e^~d&f:r==2?d&e^d&f^e&f:d^e^f)+m+c[r]+h[b]&c[9];m=f;f=e;e=p(d,30);d=j;j=t}c[4]+=j;c[5]+=d;c[6]+=e;c[7]+=f;c[8]+=m}i="";for(z=4;z<9;z++)for(a=7;a>=0;a--)i+=((c[z]&c[9])>>>a*4&15).toString(16);return i};
});

//jshint ignore: start
define('common/util/zssha1.min',[],function(){
    function SHA1() {

        this.pp = function (b, a) {
            return b << a | b >>> 32 - a
        };

        this.oo = function (l, a, k, b, c) {
            try{
                return l.charCodeAt(a * 64 + k * 4 + b) << c
            } catch(e){}
        };

        this.getHash = function(l) {

            l += "";
            for (var n = Math, c = [1518500249, 1859775393, 2400959708, 3395469782, 1732584193, 4023233417, 2562383102, 271733878, 3285377520, 4294967295], s = n.ceil(l.length / 4) + 2, q = n.ceil(s / 16), g = [], a = 0, h = [], j, d, e, f, m, i, b, k; a < q; a++) {
                g[a] = [];
                for (k = 0; k < 16; k++) {
                    g[a][k] = this.oo(l, a, k, 0, 24) | this.oo(l, a, k, 1, 16) | this.oo(l, a, k, 2, 8) | this.oo(l, a, k, 3, 0)
                }
            }
            i = l.length * 8 - 8;
            a = q - 1;
            g[a][14] = i / (c[9] + 1);
            g[a][14] = n.floor(g[a][14]);
            g[a][15] = i & c[9];
            for (a = 0; a < q; a++) {
                for (b = 0; b < 16; b++)h[b] = g[a][b];
                for (b = 16; b < 80; b++)h[b] = this.pp(h[b - 3] ^ h[b - 8] ^ h[b - 14] ^ h[b - 16], 1);
                j = c[4];
                d = c[5];
                e = c[6];
                f = c[7];
                m = c[8];
                for (b = 0; b < 80; b++) {
                    var r = n.floor(b / 20), t = this.pp(j, 5) + (r < 1 ? d & e ^ ~d & f : r == 2 ? d & e ^ d & f ^ e & f : d ^ e ^ f) + m + c[r] + h[b] & c[9];
                    m = f;
                    f = e;
                    e = this.pp(d, 30);
                    d = j;
                    j = t
                }
                c[4] += j;
                c[5] += d;
                c[6] += e;
                c[7] += f;
                c[8] += m
            }
            i = "";
            for (z = 4; z < 9; z++)
                for (a = 7; a >= 0; a--)
                    i += ((c[z] & c[9]) >>> a * 4 & 15).toString(16);
            return i
        };
    }

    return SHA1;
});

//jshint ignore: start
/* 2012 David Chambers <dc@hashify.me>  */
define('common/util/canon',[], function() {
    var CANON = {},
        keys, map, nativeMap, pad,
        __slice = [].slice,
        __hasProp = {}.hasOwnProperty;


    CANON.stringify = (function() {
        var canonicalize;
        canonicalize = function(value) {
            var pair, _ref;
            switch (Object.prototype.toString.call(value)) {
                case '[object Array]':
                    return ['Array'].concat(__slice.call(map(value, canonicalize)));
                case '[object Date]':
                    return ['Date'].concat(isFinite(+value) ? value.getUTCFullYear() + '-' + pad(value.getUTCMonth() + 1) + '-' + pad(value.getUTCDate()) + 'T' + pad(value.getUTCHours()) + ':' + pad(value.getUTCMinutes()) + ':' + pad(value.getUTCSeconds()) + '.' + pad(value.getUTCMilliseconds(), 3) + 'Z' : null);
                case '[object Function]':
                    throw new TypeError('functions cannot be serialized');
                    break;
                case '[object Number]':
                    if (isFinite(value)) {
                        return value;
                    } else {
                        return ['Number', "" + value];
                    }
                    break;
                case '[object Object]':
                    pair = function(key) {
                        return [key, canonicalize(value[key])];
                    };
                    return (_ref = ['Object']).concat.apply(_ref, map(keys(value).sort(), pair));
                case '[object RegExp]':
                    return ['RegExp', "" + value];
                case '[object Undefined]':
                    return ['Undefined'];
                default:
                    return value;
            }
        };
        return function(value) {
            return JSON.stringify(canonicalize(value));
        };
    })();

    CANON.parse = (function() {
        var canonicalize;
        canonicalize = function(value) {
            var element, elements, idx, object, what, _i, _ref;
            if (Object.prototype.toString.call(value) !== '[object Array]') {
                return value;
            }
            what = value[0], elements = 2 <= value.length ? __slice.call(value, 1) : [];
            element = elements[0];
            switch (what) {
                case 'Array':
                    return map(elements, canonicalize);
                case 'Date':
                    return new Date(element);
                case 'Number':
                    return +element;
                case 'Object':
                    object = {};
                    for (idx = _i = 0, _ref = elements.length; _i < _ref; idx = _i += 2) {
                        object[elements[idx]] = canonicalize(elements[idx + 1]);
                    }
                    return object;
                case 'RegExp':
                    return (function(func, args, ctor) {
                        ctor.prototype = func.prototype;
                        var child = new ctor, result = func.apply(child, args);
                        return Object(result) === result ? result : child;
                    })(RegExp, /^[/](.+)[/]([gimy]*)$/.exec(element).slice(1), function(){});
                case 'Undefined':
                    return void 0;
                default:
                    throw new Error('invalid input');
            }
        };
        return function(string) {
            return canonicalize(JSON.parse(string));
        };
    })();

    nativeMap = Array.prototype.map;

    map = function(array, iterator) {
        var el, _i, _len, _results;
        if (nativeMap && array.map === nativeMap) {
            return array.map(iterator);
        } else {
            _results = [];
            for (_i = 0, _len = array.length; _i < _len; _i++) {
                el = array[_i];
                _results.push(iterator(el));
            }
            return _results;
        }
    };

    keys = Object.keys || function(object) {
        var key, _results;
        _results = [];
        for (key in object) {
            if (!__hasProp.call(object, key)) continue;
            _results.push(key);
        }
        return _results;
    };

    pad = function(n, min) {
        if (min == null) {
            min = 2;
        }
        return ("" + (1000 + n)).substr(4 - min);
    };

    return CANON;

});

/*globals define*/
/*jshint node: true, browser: true*/

/**
 * @author kecso / https://github.com/kecso
 */

define('common/util/key',[
    'common/util/sha1',
    'common/util/zssha1.min',
    'common/util/assert',
    'common/util/canon'
], function (SHA1, ZS, ASSERT, CANON) {
    

    var keyType = null,
        ZSSHA = new ZS();

    function rand160Bits() {
        var result = '',
            i, code;
        for (i = 0; i < 40; i++) {
            code = Math.floor(Math.random() * 16);
            code = code > 9 ? code + 87 : code + 48;
            result += String.fromCharCode(code);
        }
        return result;
    }

    return function KeyGenerator(object, gmeConfig) {
        keyType = gmeConfig.storage.keyType;
        ASSERT(typeof keyType === 'string');

        switch (keyType) {
            case 'rand160Bits':
                return rand160Bits();
            case 'ZSSHA':
                return ZSSHA.getHash(CANON.stringify(object));
            default: //plainSHA1
                return SHA1(CANON.stringify(object));
        }
    };
});
/*globals define*/
/*jshint node:true*/
/**
 * This class implements the functionality needed to edit a model in a specific project and branch in a
 * collaborative fashion.
 *
 * It keeps a state of the open projects which in turn keeps track of the open branches.
 *
 * Each project is associated with a project-cache which is shared amongst the branches. So switching
 * between branches is (potentially) an operation that does not require lots of server round-trips.
 *
 * It is possible to have multiple projects open and multiple branches within each project. However
 * one instance of a storage can only hold a single instance of a project (or branch within a project).
 *
 * @author pmeijer / https://github.com/pmeijer
 */

define('common/storage/storageclasses/editorstorage',[
    'common/storage/storageclasses/objectloaders',
    'common/storage/constants',
    'common/storage/project/project',
    'common/util/assert',
    'common/util/key'
], function (StorageObjectLoaders, CONSTANTS, Project, ASSERT, GENKEY) {
    

    function EditorStorage(webSocket, mainLogger, gmeConfig) {
        var self = this,
            logger = mainLogger.fork('storage'),
            projects = {};

        self.logger = logger;
        self.userId = null;

        StorageObjectLoaders.call(this, webSocket, mainLogger, gmeConfig);

        this.open = function (networkHandler) {
            webSocket.connect(function (err, connectionState) {
                if (err) {
                    logger.error(err);
                    networkHandler(CONSTANTS.ERROR);
                } else if (connectionState === CONSTANTS.CONNECTED) {
                    self.connected = true;
                    self.userId = webSocket.userId;
                    networkHandler(connectionState);
                } else if (connectionState === CONSTANTS.RECONNECTED) {
                    self._rejoinWatcherRooms();
                    self._rejoinBranchRooms();
                    self.connected = true;
                    networkHandler(connectionState);
                } else if (connectionState === CONSTANTS.DISCONNECTED) {
                    self.connected = false;
                    networkHandler(connectionState);
                } else {
                    logger.error('unexpected connection state');
                    networkHandler(CONSTANTS.ERROR);
                }
            });
        };

        this.close = function (callback) {
            var error = '',
                openProjects = Object.keys(projects),
                projectCnt = openProjects.length;

            logger.debug('Closing storage, openProjects', openProjects);

            function afterProjectClosed(err) {
                if (err) {
                    logger.error(err);
                    error += err;
                }
                logger.debug('inside afterProjectClosed projectCnt', projectCnt);
                if (projectCnt === 0) {
                    // Remove the handler for the socket.io events 'connect' and 'disconnect'.
                    webSocket.socket.removeAllListeners('connect');
                    webSocket.socket.removeAllListeners('disconnect');
                    // Disconnect from the server.
                    webSocket.disconnect();
                    self.connected = false;
                    // Remove all local event-listeners.
                    webSocket.removeAllEventListeners();
                    callback(error || null);
                }
            }

            if (projectCnt > 0) {
                while (projectCnt) {
                    projectCnt -= 1;
                    this.closeProject(openProjects[projectCnt], afterProjectClosed);
                }
            } else {
                logger.debug('No projects were open, will disconnect directly');
                afterProjectClosed(null);
            }
        };

        /**
         * Callback for openProject.
         *
         * @callback EditorStorage~openProjectCallback
         * @param {string} err - error string.
         * @param {Project} project - the newly opened project.
         * @param {object} branches - the newly opened project.
         * @example
         * // branches is of the form
         * // { master: '#somevalidhash', b1: '#someothervalidhash' }
         */

        /**
         *
         * @param {string} projectName - name of project to open.
         * @param {EditorStorage~openProjectCallback} - callback
         */
        this.openProject = function (projectName, callback) {
            var data = {
                projectName: projectName
            };
            if (projects[projectName]) {
                logger.error('project is already open', projectName);
                callback('project is already open');
            }
            webSocket.openProject(data, function (err, branches, access) {
                if (err) {
                    callback(err);
                    return;
                }
                var project = new Project(projectName, self, logger, gmeConfig);
                projects[projectName] = project;
                callback(err, project, branches, access);
            });
        };

        this.createProject = function (projectName, callback) {
            var data = {
                projectName: projectName
            };
            if (projects[projectName]) {
                logger.error('project already exists', projectName);
                callback('project already exists');
                return;
            }
            webSocket.createProject(data, function (err) {
                if (err) {
                    logger.error('cannot create project ', projectName, err);
                    callback(err);
                    return;
                }

                var project = new Project(projectName, self, logger, gmeConfig);
                projects[projectName] = project;
                callback(err, project);
            });
        };

        this.closeProject = function (projectName, callback) {
            var project = projects[projectName],
                error = '',
                branchCnt,
                branchNames;
            logger.debug('closeProject', projectName);

            function closeAndDelete(err) {
                if (err) {
                    logger.error(err);
                    error += err;
                }
                logger.debug('inside closeAndDelete branchCnt', branchCnt);
                if (branchCnt === 0) {
                    delete projects[projectName];
                    logger.debug('project reference deleted, sending close to server.');
                    webSocket.closeProject({projectName: projectName}, function (err) {
                        logger.debug('project closed on server.');
                        callback(err || error);
                    });
                }
            }

            if (project) {
                branchNames = Object.keys(project.branches);
                branchCnt = branchNames.length;
                if (branchCnt > 0) {
                    logger.warn('Branches still open for project, will be closed.', projectName, branchNames);
                    while (branchCnt) {
                        branchCnt -= 1;
                        this.closeBranch(projectName, branchNames[branchCnt], closeAndDelete);
                    }
                } else {
                    closeAndDelete(null);
                }
            } else {
                logger.warn('Project is not open ', projectName);
                callback(null);
            }

        };

        this.openBranch = function (projectName, branchName, updateHandler, commitHandler, callback) {
            ASSERT(projects.hasOwnProperty(projectName), 'Project not opened: ' + projectName);
            var self = this,
                project = projects[projectName],
                data = {
                    projectName: projectName,
                    branchName: branchName
                };

            webSocket.openBranch(data, function (err, latestCommit) {
                if (err) {
                    callback(err);
                    return;
                }
                var i,
                    branchHash = latestCommit.commitObject[CONSTANTS.MONGO_ID],
                    branch = project.getBranch(branchName, false);

                branch.updateHashes(branchHash, branchHash);

                branch.commitHandler = commitHandler;
                branch.localUpdateHandler = updateHandler;

                branch.updateHandler = function (_ws, updateData) {
                    var j,
                        originHash = updateData.commitObject[CONSTANTS.MONGO_ID];
                    logger.debug('updateHandler invoked for project, branch', projectName, branchName);
                    for (j = 0; j < updateData.coreObjects.length; j += 1) {
                        project.insertObject(updateData.coreObjects[j]);
                    }

                    branch.queueUpdate(updateData);
                    branch.updateHashes(null, originHash);

                    if (branch.getCommitQueue().length === 0) {
                        if (branch.getUpdateQueue().length === 1) {
                            self._pullNextQueuedCommit(projectName, branchName);
                        }
                    } else {
                        logger.debug('commitQueue is not empty, only updating originHash.');
                    }
                };

                webSocket.addEventListener(webSocket.getBranchUpdateEventName(projectName, branchName),
                    branch.updateHandler);

                // Insert the objects from the latest commit into the project cache.
                for (i = 0; i < latestCommit.coreObjects.length; i += 1) {
                    project.insertObject(latestCommit.coreObjects[i]);
                }

                callback(err, latestCommit);
            });
        };

        this.closeBranch = function (projectName, branchName, callback) {
            ASSERT(projects.hasOwnProperty(projectName), 'Project not opened: ' + projectName);
            logger.debug('closeBranch', projectName, branchName);

            var project = projects[projectName],
                branch = project.branches[branchName];

            if (branch) {
                // This will prevent memory leaks and expose if a commit is being
                // processed at the server this time (see last error in _pushNextQueuedCommit).
                branch.cleanUp();

                // Stop listening to events from the sever
                webSocket.removeEventListener(webSocket.getBranchUpdateEventName(projectName, branchName),
                    branch.updateHandler);
            } else {
                logger.warn('Branch is not open', projectName, branchName);
                callback(null);
                return;
            }

            project.removeBranch(branchName);
            webSocket.closeBranch({projectName: projectName, branchName: branchName}, callback);
        };

        this.forkBranch = function (projectName, branchName, forkName, commitHash, callback) {
            ASSERT(projects.hasOwnProperty(projectName), 'Project not opened: ' + projectName);
            this.logger.debug('forkBranch', projectName, branchName, forkName, commitHash);
            var self = this,
                project = projects[projectName],
                branch = project.getBranch(branchName, true),
                forkData;

            forkData = branch.getCommitsForNewFork(commitHash, forkName); // commitHash = null defaults to latest commit
            self.logger.debug('forkBranch - forkData', forkData);
            if (forkData === false) {
                callback('Could not find specified commitHash');
                return;
            }

            function commitNext() {
                var currentCommitData = forkData.queue.shift();
                logger.debug('forkBranch - commitNext, currentCommitData', currentCommitData);
                if (currentCommitData) {
                    webSocket.makeCommit(currentCommitData, function (err, result) {
                        if (err) {
                            logger.error('forkBranch - failed committing', err);
                            callback(err);
                            return;
                        }
                        logger.debug('forkBranch - commit successful, hash', result);
                        commitNext();
                    });
                } else {
                    self.createBranch(projectName, forkName, forkData.commitHash, function (err) {
                        if (err) {
                            logger.error('forkBranch - failed creating new branch', err);
                            callback(err);
                            return;
                        }
                        callback(null, forkData.commitHash);
                    });
                }
            }

            commitNext();
        };

        this.setBranchHash = function (projectName, branchName, newHash, oldHash, callback) {
            var setBranchHashData = {
                projectName: projectName,
                branchName: branchName,
                newHash: newHash,
                oldHash: oldHash
            };
            webSocket.setBranchHash(setBranchHashData, callback);
        };

        this.makeCommit = function (projectName, branchName, parents, rootHash, coreObjects, msg, callback) {
            ASSERT(projects.hasOwnProperty(projectName), 'Project not opened: ' + projectName);
            var project = projects[projectName],
                branch,
                commitData = {
                    projectName: projectName
                };

            commitData.commitObject = self._getCommitObject(projectName, parents, rootHash, msg);
            commitData.coreObjects = coreObjects;
            if (typeof branchName === 'string') {
                commitData.branchName = branchName;
                branch = project.getBranch(branchName, true);
                branch.updateHashes(commitData.commitObject[CONSTANTS.MONGO_ID], null);
                branch.queueCommit(commitData);
                if (branch.getCommitQueue().length === 1) {
                    self._pushNextQueuedCommit(projectName, branchName, callback);
                }
            } else {
                ASSERT(typeof callback === 'function', 'Making commit without updating branch requires a callback.');
                webSocket.makeCommit(commitData, callback);
            }

            return commitData.commitObject; //commitHash
        };

        this.getCommonAncestorCommit = function (projectName, commitA, commitB, callback) {
            var parameters = {
                commitA: commitA,
                commitB: commitB,
                projectName: projectName
            };

            return webSocket.getCommonAncestorCommit(parameters, callback);
        };

        this._pushNextQueuedCommit = function (projectName, branchName, callback) {
            ASSERT(projects.hasOwnProperty(projectName), 'Project not opened: ' + projectName);
            var project = projects[projectName],
                branch = project.getBranch(branchName, true),
                commitData;
            logger.debug('_pushNextQueuedCommit', branch.getCommitQueue());
            if (branch.getCommitQueue().length === 0) {
                return;
            }

            commitData = branch.getFirstCommit(false);
            webSocket.makeCommit(commitData, function (err, result) {
                if (err) {
                    logger.error('makeCommit failed', err);
                }

                // This is for when e.g. a plugin makes a commit to the same branch as the
                // client and waits for the callback before proceeding.
                // (If it is a forking commit, the plugin can proceed knowing that and the client will get notified of
                // the fork through the commitHandler.
                if (typeof callback === 'function') {
                    callback(err, result);
                }

                if (branch.isOpen) {
                    branch.commitHandler(branch.getCommitQueue(), result, function (push) {
                        if (push) {
                            branch.getFirstCommit(true); // Remove the commit from the queue.
                            branch.updateHashes(null, commitData.commitObject[CONSTANTS.MONGO_ID]);
                            self._pushNextQueuedCommit(projectName, branchName);
                        }
                    });
                } else {
                    logger.error('_pushNextQueuedCommit returned from server but the branch was closed, ' +
                        'the branch has probably been closed while waiting for the response.', projectName, branchName);
                }
            });
        };

        this._getCommitObject = function (projectName, parents, rootHash, msg) {
            msg = msg || 'n/a';
            var commitObj = {
                    root: rootHash,
                    parents: parents,
                    updater: [self.userId],
                    time: (new Date()).getTime(),
                    message: msg,
                    type: 'commit'
                },
                commitHash = '#' + GENKEY(commitObj, gmeConfig);

            commitObj[CONSTANTS.MONGO_ID] = commitHash;

            return commitObj;
        };

        this._pullNextQueuedCommit = function (projectName, branchName) {
            ASSERT(projects.hasOwnProperty(projectName), 'Project not opened: ' + projectName);
            var self = this,
                project = projects[projectName],
                branch = project.getBranch(branchName, true),
                updateData;

            logger.debug('About to update, updateQueue', branch.getUpdateQueue());
            if (branch.getUpdateQueue().length === 0) {
                logger.debug('No queued updates, returns');
                return;
            }

            updateData = branch.getFirstUpdate();
            if (branch.isOpen) {
                branch.localUpdateHandler(branch.getUpdateQueue(), updateData, function (aborted) {
                    var originHash = updateData.commitObject[CONSTANTS.MONGO_ID];
                    if (aborted === false) {
                        logger.debug('New commit was successfully loaded, updating localHash.');
                        branch.updateHashes(originHash, null);
                        branch.getFirstUpdate(true);
                        self._pullNextQueuedCommit(projectName, branchName);
                    } else {
                        logger.warn('Loading of update commit was aborted or failed.', updateData);
                    }
                });
            } else {
                logger.error('_pullNextQueuedCommit returned from server but the branch was closed.',
                    projectName, branchName);
            }
        };

        this._rejoinBranchRooms = function () {
            var projectName,
                project,
                branchName;
            logger.debug('_rejoinBranchRooms');
            for (projectName in projects) {
                if (projects.hasOwnProperty(projectName)) {
                    project = projects[projectName];
                    logger.debug('_rejoinBranchRooms found project', projectName);
                    for (branchName in project.branches) {
                        if (project.branches.hasOwnProperty(branchName)) {
                            logger.debug('_rejoinBranchRooms joining branch', projectName, branchName);
                            webSocket.watchBranch({
                                projectName: projectName,
                                branchName: branchName,
                                join: true
                            });
                        }
                    }
                }
            }
        };
    }

    EditorStorage.prototype = Object.create(StorageObjectLoaders.prototype);
    EditorStorage.prototype.constructor = EditorStorage;

    return EditorStorage;
});
/*globals define, require*/
/*jshint browser:true*/
/**
 * @author pmeijer / https://github.com/pmeijer
 */

define('common/storage/socketio/browserclient',[], function () {
    

    function IoClient (gmeConfig) {
        this.connect = function (callback) {
            var hostAddress = window.location.protocol + '//' + window.location.host;

            if (window.__karma__) {
                // TRICKY: karma uses web sockets too, we need to use the gme server's port
                hostAddress = window.location.protocol + '//localhost:' + gmeConfig.server.port;
            }

            require([hostAddress + '/socket.io/socket.io.js'], function (io_) {
                var io = io_ || window.io,
                    socket = io.connect(hostAddress, gmeConfig.socketIO);
                callback(null, socket);
            });
        };
    }

    return IoClient;
});
/*globals define*/
/*jshint node: true, browser: true*/

/**
 * @author rkereskenyi / https://github.com/rkereskenyi
 */

define('common/EventDispatcher',[], function () {
    

    var EventDispatcher = function () {
        this._eventList = {};
    };

    EventDispatcher.prototype = {
        _eventList: null,
        _getEvent: function (eventName, create) {
            // Check if Array of Event Handlers has been created
            if (!this._eventList[eventName]) {

                // Check if the calling method wants to create the Array
                // if not created. This reduces unneeded memory usage.
                if (!create) {
                    return null;
                }

                // Create the Array of Event Handlers
                this._eventList[eventName] = [];
                // new Array
            }

            // return the Array of Event Handlers already added
            return this._eventList[eventName];
        },
        addEventListener: function (eventName, handler) {
            // Get the Array of Event Handlers
            var evt = this._getEvent(eventName, true);

            // Add the new Event Handler to the Array
            evt.push(handler);
        },
        removeEventListener: function (eventName, handler) {
            // Get the Array of Event Handlers
            var evt = this._getEvent(eventName);

            if (!evt) {
                return;
            }

            // Helper Method - an Array.indexOf equivalent
            var getArrayIndex = function (array, item) {
                for (var i = 0; i < array.length; i++) {
                    if (array[i] === item) {
                        return i;
                    }
                }
                return -1;
            };

            // Get the Array index of the Event Handler
            var index = getArrayIndex(evt, handler);

            if (index > -1) {
                // Remove Event Handler from Array
                evt.splice(index, 1);
            }
        },
        removeAllEventListeners: function (eventName) {
            // Get the Array of Event Handlers
            var evt = this._getEvent(eventName);

            if (!evt) {
                return;
            }

            evt.splice(0, evt.length);
        },
        dispatchEvent: function (eventName, eventArgs) {
            // Get a function that will call all the Event Handlers internally
            var handler = this._getEventHandler(eventName);
            if (handler) {
                // call the handler function
                // Pass in "sender" and "eventArgs" parameters
                handler(this, eventArgs);
            }
        },
        _getEventHandler: function (eventName) {
            // Get Event Handler Array for this Event
            var evt = this._getEvent(eventName, false);
            if (!evt || evt.length === 0) {
                return null;
            }

            // Create the Handler method that will use currying to
            // call all the Events Handlers internally
            var h = function (sender, args) {
                for (var i = 0; i < evt.length; i++) {
                    evt[i](sender, args);
                }
            };

            // Return this new Handler method
            return h;
        }
    };

    return EventDispatcher;
});
/*globals define*/
/*jshint browser: true, node:true*/
/**
 * @author pmeijer / https://github.com/pmeijer
 */

// socket.io-client
//
define('common/storage/socketio/websocket',[
    'common/EventDispatcher',
    'common/storage/constants'
], function (EventDispatcher, CONSTANTS) {

    

    function WebSocket(ioClient, mainLogger, gmeConfig) {
        var self = this,
            logger = mainLogger.fork('WebSocket'),
            beenConnected = false;

        self.socket = null;
        self.userId = null;

        logger.debug('ctor');
        EventDispatcher.call(this);

        this.connect = function (networkHandler) {
            logger.debug('Connecting via ioClient.');
            ioClient.connect(function (err, socket_) {
                if (err) {
                    networkHandler(err);
                    return;
                }
                self.socket = socket_;

                self.socket.on('connect', function () {
                    if (beenConnected) {
                        logger.debug('Socket got reconnected.');
                        networkHandler(null, CONSTANTS.RECONNECTED);
                    } else {
                        logger.debug('Socket got connected for the first time.');
                        beenConnected = true;
                        self.socket.emit('getUserId', function (err, userId) {
                            if (err) {
                                self.userId = gmeConfig.authentication.guestAccount;
                                logger.error('Error getting user id setting to default', err, self.userId);
                            } else {
                                self.userId = userId;
                            }
                            networkHandler(null, CONSTANTS.CONNECTED);
                        });
                    }
                });

                self.socket.on('disconnect', function () {
                    logger.debug('Socket got disconnected!');
                    networkHandler(null, CONSTANTS.DISCONNECTED);
                });

                self.socket.on(CONSTANTS.PROJECT_DELETED, function (data) {
                    data.etype = CONSTANTS.PROJECT_DELETED;
                    self.dispatchEvent(CONSTANTS.PROJECT_DELETED, data);
                });

                self.socket.on(CONSTANTS.PROJECT_CREATED, function (data) {
                    data.etype = CONSTANTS.PROJECT_CREATED;
                    self.dispatchEvent(CONSTANTS.PROJECT_CREATED, data);
                });

                self.socket.on(CONSTANTS.BRANCH_CREATED, function (data) {
                    data.etype = CONSTANTS.BRANCH_CREATED;
                    self.dispatchEvent(CONSTANTS.BRANCH_CREATED + data.projectName, data);
                });

                self.socket.on(CONSTANTS.BRANCH_DELETED, function (data) {
                    data.etype = CONSTANTS.BRANCH_DELETED;
                    self.dispatchEvent(CONSTANTS.BRANCH_DELETED + data.projectName, data);
                });

                self.socket.on(CONSTANTS.BRANCH_HASH_UPDATED, function (data) {
                    data.etype = CONSTANTS.BRANCH_HASH_UPDATED;
                    self.dispatchEvent(CONSTANTS.BRANCH_HASH_UPDATED + data.projectName, data);
                });

                self.socket.on(CONSTANTS.BRANCH_UPDATED, function (data) {
                    self.dispatchEvent(self.getBranchUpdateEventName(data.projectName, data.branchName), data);
                });
            });
        };

        this.disconnect = function () {
            self.socket.disconnect();
            beenConnected = false; //This is a forced disconnect from the storage and all listeners are removed
        };

        // watcher functions
        this.watchDatabase = function (data, callback) {
            self.socket.emit('watchDatabase', data, callback);
        };

        this.watchProject = function (data, callback) {
            self.socket.emit('watchProject', data, callback);
        };

        this.watchBranch = function (data, callback) {
            self.socket.emit('watchBranch', data, callback);
        };

        // model editing functions
        this.openProject = function (data, callback) {
            self.socket.emit('openProject', data, callback);
        };

        this.closeProject = function (data, callback) {
            self.socket.emit('closeProject', data, callback);
        };

        this.openBranch = function (data, callback) {
            self.socket.emit('openBranch', data, callback);
        };

        this.closeBranch = function (data, callback) {
            self.socket.emit('closeBranch', data, callback);
        };

        this.makeCommit = function (data, callback) {
            self.socket.emit('makeCommit', data, callback);
        };

        this.loadObjects = function (data, callback) {
            self.socket.emit('loadObjects', data, callback);
        };

        this.setBranchHash = function (data, callback) {
            self.socket.emit('setBranchHash', data, callback);
        };

        // REST like functions
        this.getProjectNames = function (data, callback) {
            self.socket.emit('getProjectNames', data, callback);
        };

        this.getProjects = function (data, callback) {
            self.socket.emit('getProjects', data, callback);
        };

        this.getProjectsAndBranches = function (data, callback) {
            self.socket.emit('getProjectsAndBranches', data, callback);
        };

        this.deleteProject = function (data, callback) {
            self.socket.emit('deleteProject', data, callback);
        };

        this.createProject = function (data, callback) {
            self.socket.emit('createProject', data, callback);
        };

        this.getBranches = function (data, callback) {
            self.socket.emit('getBranches', data, callback);
        };

        this.getCommits = function (data, callback) {
            self.socket.emit('getCommits', data, callback);
        };

        this.getLatestCommitData = function (data, callback) {
            self.socket.emit('getLatestCommitData', data, callback);
        };

        //temporary simple request / result functions
        this.simpleRequest = function (data, callback) {
            self.socket.emit('simpleRequest', data, callback);
        };

        this.simpleResult = function (data, callback) {
            self.socket.emit('simpleResult', data, callback);
        };

        this.simpleQuery = function (workerId, data, callback) {
            self.socket.emit('simpleQuery', workerId, data, callback);
        };

        this.getCommonAncestorCommit = function (data, callback) {
            self.socket.emit('getCommonAncestorCommit', data, callback);
        };

        // Helper functions
        this.getBranchUpdateEventName = function (projectName, branchName) {
            return CONSTANTS.BRANCH_UPDATED + projectName + CONSTANTS.ROOM_DIVIDER + branchName;
        };
    }

    WebSocket.prototype = Object.create(EventDispatcher.prototype);
    WebSocket.prototype.constructor = WebSocket;

    return WebSocket;
});
/*globals define*/
/*jshint browser:true*/
/**
 *
 * @author pmeijer / https://github.com/pmeijer
 */

define('common/storage/browserstorage',[
    'common/storage/storageclasses/editorstorage',
    'common/storage/socketio/browserclient',
    'common/storage/socketio/websocket',
], function (EditorStorage, BrowserIoClient, WebSocket) {
    

    var _storage;

    function _createStorage(logger, gmeConfig) {
        var ioClient = new BrowserIoClient(gmeConfig),
            webSocket = new WebSocket(ioClient, logger, gmeConfig),
            storage = new EditorStorage(webSocket, logger, gmeConfig);

        return storage;
    }

    function getStorage (logger, gmeConfig, forceNew) {
        logger.debug('getStorage');

        if (!_storage) {
            logger.debug('No storage existed, will create new one..');
            _storage = _createStorage(logger, gmeConfig);
        } else {
            logger.debug('Storage existed...');

            if (forceNew === true) {
                logger.debug('Force new set to true, will create new one.');
                _storage = _createStorage(logger, gmeConfig);
            }
        }

        return _storage;
    }

    return {
        getStorage: getStorage
    };
});
/*globals define*/
/*jshint node: true, browser: true*/

/**
 * @author mmaroti / https://github.com/mmaroti
 */

define('common/core/future',[], function () {
    

    var maxDepth = 5;

    var ASSERT = function (cond) {
        if (!cond) {
            var error = new Error('future assertion failed');
            console.log(error.stack);
            throw error;
        }
    };

    // ------- Future -------

    var UNRESOLVED = {};

    var Future = function () {
        this.value = UNRESOLVED;
        this.listener = null;
        this.param = null;
    };

    var setValue = function (future, value) {
        ASSERT(future instanceof Future && future.value === UNRESOLVED);

        if (value instanceof Future) {
            setListener(value, setValue, future);
        } else {
            future.value = value;

            if (future.listener !== null) {
                future.listener(future.param, value);
            }
        }
    };

    var setListener = function (future, listener, param) {
        ASSERT(future instanceof Future && future.listener === null && future.value === UNRESOLVED);
        ASSERT(typeof listener === 'function' && listener.length === 2);

        future.listener = listener;
        future.param = param;

        if (future.value !== UNRESOLVED) {
            listener(param, future);
        }
    };

    var isUnresolved = function (value) {
        return (value instanceof Future) && value.value === UNRESOLVED;
    };

    var getValue = function (value) {
        if (value instanceof Future) {
            if (value.value instanceof Error) {
                throw value.value;
            } else if (value.value !== UNRESOLVED) {
                return value.value;
            }
        }
        return value;
    };

    // ------- adapt

    var adapt = function (func) {
        ASSERT(typeof func === 'function');

        return function adaptx() {
            var args = arguments;
            var future = new Future();

            args[args.length++] = function adaptCallback(error, value) {
                if (error) {
                    value = error instanceof Error ? error : new Error(error);
                } else {
                    ASSERT(!(value instanceof Error));
                }
                setValue(future, value);
            };

            func.apply(this, args);

            return getValue(future);
        };
    };

    var unadapt = function (func) {
        ASSERT(typeof func === 'function');

        if (func.length === 0) {
            return function unadapt0(callback) {
                var value;
                try {
                    value = func.call(this);
                } catch (error) {
                    callback(error);
                    return;
                }
                then(value, callback);
            };
        } else if (func.length === 1) {
            return function unadapt1(arg, callback) {
                var value;
                try {
                    value = func.call(this, arg);
                } catch (error) {
                    callback(error);
                    return;
                }
                then(value, callback);
            };
        } else {
            return function unadaptx() {
                var args = arguments;

                var callback = args[--args.length];
                ASSERT(typeof callback === 'function');

                var value;
                try {
                    value = func.apply(this, args);
                } catch (error) {
                    callback(error);
                    return;
                }
                then(value, callback);
            };
        }
    };

    var delay = function (delay, value) {
        var future = new Future();
        setTimeout(setValue, delay, future, value);
        return future;
    };

    // ------- call -------

    var Func = function (func, that, args, index) {
        this.value = UNRESOLVED;
        this.listener = null;
        this.param = null;

        this.func = func;
        this.that = that;
        this.args = args;
        this.index = index;

        setListener(args[index], setArgument, this);
    };

    Func.prototype = Future.prototype;

    var setArgument = function (future, value) {
        if (!(value instanceof Error)) {
            try {
                var args = future.args;
                args[future.index] = value;

                while (++future.index < args.length) {
                    value = args[future.index];
                    if (isUnresolved(value)) {
                        setListener(value, setArgument, future);
                        return;
                    } else {
                        args[future.index] = getValue(value);
                    }
                }

                value = future.func.apply(future.that, args);
                ASSERT(!(value instanceof Error));
            } catch (error) {
                value = error instanceof Error ? error : new Error(error);
            }
        }

        setValue(future, value);
    };

    var call = function () {
        var args = arguments;

        var func = args[--args.length];
        ASSERT(typeof func === 'function');

        for (var i = 0; i < args.length; ++i) {
            if (isUnresolved(args[i])) {
                return new Func(func, this, args, i);
            } else {
                args[i] = getValue(args[i]);
            }
        }
        return func.apply(this, args);
    };

    // ------- join -------

    var Join = function (first, second) {
        this.value = UNRESOLVED;
        this.listener = null;
        this.param = null;

        this.missing = 2;
        setListener(first, setJoinand, this);
        setListener(second, setJoinand, this);
    };

    Join.prototype = Object.create(Future.prototype);

    var setJoinand = function (future, value) {
        if (value instanceof Error) {
            setValue(future, value);
        } else if (--future.missing <= 0) {
            setValue(future, undefined);
        }
    };

    var join = function (first, second) {
        if (getValue(first) instanceof Future) {
            if (getValue(second) instanceof Future) {
                if (first instanceof Join) {
                    first.missing += 1;
                    setListener(second, setJoinand, first);
                    return first;
                } else if (second instanceof Join) {
                    second.missing += 1;
                    setListener(first, setJoinand, second);
                    return second;
                } else {
                    return new Join(first, second);
                }
            } else {
                return first;
            }
        } else {
            return getValue(second);
        }
    };

    // ------- hide -------

    var Hide = function (future, handler) {
        this.value = UNRESOLVED;
        this.listener = null;
        this.param = null;

        this.handler = handler;
        setListener(future, hideValue, this);
    };

    Hide.prototype = Future.prototype;

    var hideValue = function (future, value) {
        try {
            if (value instanceof Error) {
                value = future.handler(value);
            }
        } catch (error) {
            value = error instanceof Error ? error : new Error(error);
        }

        setValue(future, value);
    };

    var printStack = function (error) {
        console.log(error.stack);
    };

    var hide = function (future, handler) {
        if (typeof handler !== 'function') {
            handler = printStack;
        }

        if (isUnresolved(future)) {
            return new Hide(future, handler);
        } else if (future.value instanceof Error) {
            return handler(future.value);
        } else {
            return getValue(future);
        }
    };

    // ------- array -------

    var Arr = function (array, index) {
        this.value = UNRESOLVED;
        this.listener = null;
        this.param = null;

        this.array = array;
        this.index = index;

        setListener(array[index], setMember, this);
    };

    Arr.prototype = Future.prototype;

    var setMember = function (future, value) {
        if (!(value instanceof Error)) {
            try {
                var array = future.array;
                array[future.index] = value;

                while (++future.index < array.length) {
                    value = array[future.index];
                    if (isUnresolved(value)) {
                        setListener(value, setMember, future);
                        return;
                    } else {
                        array[future.index] = getValue(value);
                    }
                }

                value = array;
            } catch (error) {
                value = error instanceof Error ? error : new Error(error);
            }
        }

        setValue(future, value);
    };

    var array = function (array) {
        ASSERT(array instanceof Array);

        for (var i = 0; i < array.length; ++i) {
            if (isUnresolved(array[i])) {
                return new Arr(array, i);
            }
        }

        return array;
    };

    // ------- then -------

    var thenHandler = function (callback, value) {
        if (value instanceof Error) {
            callback(value);
        } else {
            callback(null, value);
        }
    };

    var calldepth = 0;
    var then = function (future, callback) {
        var error = null,
            value;

        if (!(future instanceof Future)) {
            value = future;
        } else if (future.value === UNRESOLVED) {
            setListener(future, thenHandler, callback);
            return;
        } else if (future.value instanceof Error) {
            error = future.value;
        } else {
            value = future.value;
        }

        if (calldepth < maxDepth) {
            ++calldepth;
            try {
                callback(error, value);
            } catch (err) {
                console.log('unhandled error from callback', err);
            }
            --calldepth;
        } else {
            setTimeout(callback, 0, error, value);
        }
    };

    // -------

    return {
        adapt: adapt,
        unadapt: unadapt,
        delay: delay,
        call: call,
        array: array,
        join: join,
        hide: hide,
        then: then
    };
});

/*globals define*/
/*jshint node: true, browser: true, camelcase: false*/

/**
 * @author mmaroti / https://github.com/mmaroti
 */

(function () {
    

    // ------- assert -------

    var TASYNC_TRACE_ENABLE = true;

    function setTrace(value) {
        TASYNC_TRACE_ENABLE = value;
    }

    function assert(cond) {
        if (!cond) {
            throw new Error('tasync internal error');
        }
    }

    // ------- Future -------

    var STATE_LISTEN = 0;
    var STATE_REJECTED = 1;
    var STATE_RESOLVED = 2;

    var Future = function () {
        this.state = STATE_LISTEN;
        this.value = [];
    };

    Future.prototype.register = function (target) {
        assert(this.state === STATE_LISTEN);
        assert(typeof target === 'object' && target !== null);

        this.value.push(target);
    };

    Future.prototype.resolve = function (value) {
        assert(this.state === STATE_LISTEN && !(value instanceof Future));

        var listeners = this.value;

        this.state = STATE_RESOLVED;
        this.value = value;

        var i;
        for (i = 0; i < listeners.length; ++i) {
            listeners[i].onResolved(value);
        }
    };

    Future.prototype.reject = function (error) {
        assert(this.state === STATE_LISTEN && error instanceof Error);

        var listeners = this.value;

        this.state = STATE_REJECTED;
        this.value = error;

        var i;
        for (i = 0; i < listeners.length; ++i) {
            listeners[i].onRejected(error);
        }
    };

    // ------- Delay -------

    function delay(timeout, value) {
        if (timeout < 0) {
            return value;
        }

        var future = new Future();
        setTimeout(function () {
            future.resolve(value);
        }, timeout);
        return future;
    }

    // ------- Lift -------

    var FutureLift = function (array, index) {
        Future.call(this);

        this.array = array;
        this.index = index;
    };

    FutureLift.prototype = Object.create(Future.prototype);

    FutureLift.prototype.onResolved = function (value) {
        assert(this.state === STATE_LISTEN);

        var array = this.array;
        array[this.index] = value;

        while (++this.index < array.length) {
            value = array[this.index];
            if (value instanceof Future) {
                if (value.state === STATE_RESOLVED) {
                    array[this.index] = value.value;
                } else if (value.state === STATE_LISTEN) {
                    value.register(this);
                    return;
                } else {
                    assert(value.state === STATE_REJECTED);
                    this.reject(value.value);
                    return;
                }
            }
        }

        this.array = null;
        this.resolve(array);
    };

    FutureLift.prototype.onRejected = function (error) {
        this.array = null;
        this.reject(error);
    };

    var lift = function (array) {
        if (!(array instanceof Array)) {
            throw new Error('array argument is expected');
        }

        var index;
        for (index = 0; index < array.length; ++index) {
            var value = array[index];
            if (value instanceof Future) {
                if (value.state === STATE_RESOLVED) {
                    array[index] = value.value;
                } else if (value.state === STATE_LISTEN) {
                    var future = new FutureLift(array, index);
                    value.register(future);
                    return future;
                } else {
                    assert(value.state === STATE_REJECTED);
                    return value;
                }
            }
        }

        return array;
    };

    // ------- Apply -------

    var ROOT = {
        subframes: 0
    };

    var FRAME = ROOT;

    var FutureApply = function tasync_trace_end(func, that, args, index) {
        Future.call(this);

        this.caller = FRAME;
        this.position = ++FRAME.subframes;
        this.subframes = 0;

        if (TASYNC_TRACE_ENABLE) {
            this.trace = new Error();
        }

        this.func = func;
        this.that = that;
        this.args = args;
        this.index = index;
    };

    FutureApply.prototype = Object.create(Future.prototype);

    FutureApply.prototype.getPath = function () {
        var future = this.caller,
            path = [this.position];

        while (future !== ROOT) {
            path.push(future.position);
            future = future.caller;
        }

        return path;
    };

    function getSlice(trace) {
        assert(typeof trace === 'string');

        var end = trace.indexOf('tasync_trace_start');
        if (end >= 0) {
            end = trace.lastIndexOf('\n', end) + 1;
        } else {
            if (trace.charAt(trace.length - 1) !== '\n') {
                // trace += '\n';
            }
            end = undefined;
        }

        var start = trace.indexOf('tasync_trace_end');
        if (start >= 0) {
            start = trace.indexOf('\n', start) + 1;
            if (start >= 0) {
                start = trace.indexOf('\n', start) + 1;
            }
        } else {
            start = 0;
        }

        return trace.substring(start, end);
    }

    function createError(error, future) {
        if (!(error instanceof Error)) {
            error = new Error(error);
        }

        if (TASYNC_TRACE_ENABLE) {
            error.trace = getSlice(error.stack);
            do {
                error.trace += '*** callback ***\n';
                error.trace += getSlice(future.trace.stack);
                future = future.caller;
            } while (future !== ROOT);
        }

        return error;
    }

    FutureApply.prototype.onRejected = function (error) {
        this.args = null;
        this.reject(error);
    };

    FutureApply.prototype.onResolved = function tasync_trace_start(value) {
        assert(this.state === STATE_LISTEN);

        var args = this.args;
        args[this.index] = value;

        while (--this.index >= 0) {
            value = args[this.index];
            if (value instanceof Future) {
                if (value.state === STATE_RESOLVED) {
                    args[this.index] = value.value;
                } else if (value.state === STATE_LISTEN) {
                    value.register(this);
                    return;
                } else {
                    assert(value.state === STATE_REJECTED);
                    this.reject(value.value);
                    return;
                }
            }
        }

        assert(FRAME === ROOT);
        FRAME = this;

        this.args = null;
        try {
            value = this.func.apply(this.that, args);
        } catch (error) {
            FRAME = ROOT;

            this.reject(createError(error, this));
            return;
        }

        FRAME = ROOT;

        if (value instanceof Future) {
            assert(value.state === STATE_LISTEN);

            this.onResolved = this.resolve;
            value.register(this);
        } else {
            this.resolve(value);
        }
    };

    var apply = function (func, args, that) {
        if (typeof func !== 'function') {
            throw new Error('function argument is expected');
        } else if (!(args instanceof Array)) {
            throw new Error('array argument is expected');
        }

        var index = args.length;
        while (--index >= 0) {
            var value = args[index];
            if (value instanceof Future) {
                if (value.state === STATE_LISTEN) {
                    var future = new FutureApply(func, that, args, index);
                    value.register(future);
                    return future;
                } else if (value.state === STATE_RESOLVED) {
                    args[index] = value.value;
                } else {
                    assert(value.state === STATE_REJECTED);
                    return value;
                }
            }
        }

        return func.apply(that, args);
    };

    // ------- Call -------

    var FutureCall = function tasync_trace_end(args, index) {
        Future.call(this);

        this.caller = FRAME;
        this.position = ++FRAME.subframes;
        this.subframes = 0;

        if (TASYNC_TRACE_ENABLE) {
            this.trace = new Error();
        }

        this.args = args;
        this.index = index;
    };

    FutureCall.prototype = Object.create(Future.prototype);

    FutureCall.prototype.getPath = FutureApply.prototype.getPath;
    FutureCall.prototype.onRejected = FutureApply.prototype.onRejected;

    var FUNCTION_CALL = Function.call;

    FutureCall.prototype.onResolved = function tasync_trace_start(value) {
        assert(this.state === STATE_LISTEN);

        var args = this.args;
        args[this.index] = value;

        while (--this.index >= 0) {
            value = args[this.index];
            if (value instanceof Future) {
                if (value.state === STATE_RESOLVED) {
                    args[this.index] = value.value;
                } else if (value.state === STATE_LISTEN) {
                    value.register(this);
                    return;
                } else {
                    assert(value.state === STATE_REJECTED);
                    this.reject(value.value);
                    return;
                }
            }
        }

        assert(FRAME === ROOT);
        FRAME = this;

        this.args = null;
        try {
            var func = args[0];
            args[0] = null;
            value = FUNCTION_CALL.apply(func, args);
        } catch (error) {
            FRAME = ROOT;

            this.reject(createError(error, this));
            return;
        }

        FRAME = ROOT;

        if (value instanceof Future) {
            assert(value.state === STATE_LISTEN);

            this.onResolved = this.resolve;
            value.register(this);
        } else {
            this.resolve(value);
        }
    };

    var call = function () {
        var index = arguments.length;
        while (--index >= 0) {
            var value = arguments[index];
            if (value instanceof Future) {
                if (value.state === STATE_LISTEN) {
                    var future = new FutureCall(arguments, index);
                    value.register(future);
                    return future;
                } else if (value.state === STATE_RESOLVED) {
                    arguments[index] = value.value;
                } else {
                    assert(value.state === STATE_REJECTED);
                    return value;
                }
            }
        }

        var func = arguments[0];
        return FUNCTION_CALL.apply(func, arguments);
    };

    // ------- TryCatch -------

    function FutureTryCatch(handler) {
        Future.call(this);

        this.handler = handler;
    }

    FutureTryCatch.prototype = Object.create(Future.prototype);

    FutureTryCatch.prototype.onRejected = function (error) {
        try {
            var value = this.handler(error);

            if (value instanceof Future) {
                this.onRejected = Future.prorotype.reject;
                value.register(this);
            } else {
                this.resolve(value);
            }
        } catch (err) {
            this.reject(err);
        }
    };

    FutureTryCatch.prototype.onResolved = Future.prototype.resolve;

    function trycatch(func, handler) {
        if (typeof func !== 'function' || typeof handler !== 'function') {
            throw new Error('function arguments are expected');
        }

        try {
            var value = func();

            if (value instanceof Future) {
                var future = new FutureTryCatch(handler);
                value.register(future);

                return future;
            } else {
                return value;
            }
        } catch (error) {
            return handler(error);
        }
    }

    // ------- Wrap -------

    function wrap(func) {
        if (typeof func !== 'function') {
            throw new Error('function argument is expected');
        }

        if (typeof func.tasync_wraped === 'undefined') {
            func.tasync_wraped = function () {
                var args = arguments;
                var future = new Future();

                args[args.length++] = function (error, value) {
                    if (error) {
                        future.reject(error instanceof Error ? error : new Error(error));
                    } else {
                        future.resolve(value);
                    }
                };

                func.apply(this, args);

                if (future.state === STATE_LISTEN) {
                    return future;
                } else if (future.state === STATE_RESOLVED) {
                    return future.value;
                } else {
                    assert(future.state === STATE_REJECTED);
                    throw future.value;
                }
            };

            func.tasync_wraped.tasync_unwraped = func;
        }

        return func.tasync_wraped;
    }

    // ------- Unwrap -------

    function UnwrapListener(callback) {
        this.callback = callback;
    }

    UnwrapListener.prototype.onRejected = function (error) {
        this.callback(error);
    };

    UnwrapListener.prototype.onResolved = function (value) {
        this.callback(null, value);
    };

    function unwrap(func) {
        if (typeof func !== 'function') {
            throw new Error('function argument is expected');
        }

        if (typeof func.tasync_unwraped === 'undefined') {
            func.tasync_unwraped = function () {
                var args = arguments;

                var callback = args[--args.length];
                assert(typeof callback === 'function');

                var value;
                try {
                    value = func.apply(this, args);
                } catch (error) {
                    callback(error);
                    return;
                }

                if (value instanceof Future) {
                    assert(value.state === STATE_LISTEN);

                    var listener = new UnwrapListener(callback);
                    value.register(listener);
                } else {
                    callback(null, value);
                }
            };

            func.tasync_unwraped.tasync_wraped = func;
        }

        return func.tasync_unwraped;
    }

    // ------- Throttle -------

    function FutureThrottle(func, that, args) {
        Future.call(this);

        this.func = func;
        this.that = that;
        this.args = args;

        this.caller = FRAME;
        this.position = ++FRAME.subframes;

        this.path = this.getPath();
    }

    FutureThrottle.prototype = Object.create(Future.prototype);

    FutureThrottle.prototype.execute = function () {
        var value;
        try {
            assert(FRAME === ROOT);
            FRAME = this;

            value = this.func.apply(this.that, this.args);

            FRAME = ROOT;
        } catch (error) {
            FRAME = ROOT;

            this.reject(error);
            return;
        }

        if (value instanceof Future) {
            assert(value.state === STATE_LISTEN);
            value.register(this);
        } else {
            this.resolve(value);
        }
    };

    FutureThrottle.prototype.getPath = FutureApply.prototype.getPath;
    FutureThrottle.prototype.onResolved = Future.prototype.resolve;
    FutureThrottle.prototype.onRejected = Future.prototype.reject;

    FutureThrottle.prototype.compare = function (second) {
        var first = this.path;
        second = second.path;

        var i, limit = first.length < second.length ? first.length : second.length;
        for (i = 0; i < limit; ++i) {
            if (first[i] !== second[i]) {
                return first[i] - second[i];
            }
        }

        return first.length - second.length;
    };

    function ThrottleListener(limit) {
        this.running = 0;
        this.limit = limit;
        this.queue = [];
    }

    function priorityQueueInsert(queue, elem) {
        var low = 0;
        var high = queue.length;

        while (low < high) {
            var mid = Math.floor((low + high) / 2);
            assert(low <= mid && mid < high);

            if (elem.compare(queue[mid]) < 0) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }

        queue.splice(low, 0, elem);
    }

    ThrottleListener.prototype.execute = function (func, that, args) {
        if (this.running < this.limit) {
            var value = func.apply(that, args);

            if (value instanceof Future) {
                assert(value.state === STATE_LISTEN);

                ++this.running;
                value.register(this);
            }

            return value;
        } else {
            var future = new FutureThrottle(func, that, args);
            priorityQueueInsert(this.queue, future);

            return future;
        }
    };

    ThrottleListener.prototype.onResolved = function () {
        if (this.queue.length > 0) {
            var future = this.queue.pop();
            future.register(this);

            future.execute();
        } else {
            --this.running;
        }
    };

    ThrottleListener.prototype.onRejected = ThrottleListener.prototype.onResolved;

    // TODO: prevent recursion, otheriwise throttle will not work
    function throttle(func, limit) {
        if (typeof func !== 'function') {
            throw new Error('function argument is expected');
        } else if (typeof limit !== 'number') {
            throw new Error('number argument is expected');
        }

        var listener = new ThrottleListener(limit);

        return function () {
            return listener.execute(func, this, arguments);
        };
    }

    // ------- Join -------

    function FutureJoin(first) {
        Future.call(this);

        this.first = first;
        this.missing = first instanceof Future && first.state === STATE_LISTEN ? 1 : 0;
    }

    FutureJoin.prototype = Object.create(Future.prototype);

    FutureJoin.prototype.onResolved = function (/*value*/) {
        if (--this.missing === 0) {
            assert(this.state !== STATE_RESOLVED);

            if (this.state === STATE_LISTEN) {
                if (this.first instanceof Future) {
                    assert(this.first.state === STATE_RESOLVED);

                    this.resolve(this.first.value);
                } else {
                    this.resolve(this.first);
                }
            }
        }
    };

    FutureJoin.prototype.onRejected = function (error) {
        if (this.state === STATE_LISTEN) {
            this.reject(error);
        }
    };

    function join(first, second) {
        if (first instanceof Future && first.state === STATE_REJECTED) {
            return first;
        } else if (second instanceof Future) {
            if (second.state === STATE_RESOLVED) {
                return first;
            } else if (second.state === STATE_REJECTED) {
                return second;
            }
        } else {
            return first;
        }

        if (!(first instanceof FutureJoin)) {
            first = new FutureJoin(first);
        }

        first.missing += 1;
        second.register(first);

        return first;
    }

    // ------- TASYNC -------

    var TASYNC = {
        setTrace: setTrace,
        delay: delay,
        lift: lift,
        apply: apply,
        call: call,
        trycatch: trycatch,
        wrap: wrap,
        unwrap: unwrap,
        throttle: throttle,
        join: join
    };

    if (typeof define === 'function' && define.amd) {
        define('common/core/tasync',[], function () {
            return TASYNC;
        });
    } else {
        module.exports = TASYNC;
    }
}());

/*globals define*/
/*jshint node: true, browser: true*/

/**
 * @author mmaroti / https://github.com/mmaroti
 */

define('common/core/coretree',[
    'common/util/assert',
    'common/util/key',
    'common/core/future',
    'common/core/tasync'
], function (ASSERT, GENKEY, FUTURE, TASYNC) {

    

    var HASH_REGEXP = new RegExp('#[0-9a-f]{40}');
    var isValidHash = function (key) {
        return typeof key === 'string' && key.length === 41 && HASH_REGEXP.test(key);
    };

    var MAX_RELID = Math.pow(2, 31);
    var createRelid = function (data) {
        ASSERT(data && typeof data === 'object');

        var relid;
        do {
            relid = Math.floor(Math.random() * MAX_RELID);
            // relid = relid.toString();
        } while (data[relid] !== undefined);

        return '' + relid;
    };

    // make relids deterministic
    if (false) {
        var nextRelid = 0;
        createRelid = function (data) {
            ASSERT(data && typeof data === 'object');

            var relid;
            do {
                relid = (nextRelid += -1);
            } while (data[relid] !== undefined);

            return '' + relid;
        };
    }

    var rootCounter = 0;

    return function (storage, options) {
        ASSERT(typeof options === 'object');
        ASSERT(typeof options.globConf === 'object');
        ASSERT(typeof options.logger !== 'undefined');

        var gmeConfig = options.globConf,
            logger = options.logger.fork('coretree'),
            MAX_AGE = 3, // MAGIC NUMBER
            MAX_TICKS = 2000, // MAGIC NUMBER
            MAX_MUTATE = 30000, // MAGIC NUMBER

            ID_NAME = storage.ID_NAME,
            __getEmptyData = function () {
                return {};
            },
            roots = [],
            ticks = 0,
            stackedObjects = {};

        storage.loadObject = TASYNC.wrap(storage.loadObject);

        // ------- static methods

        var getParent = function (node) {
            ASSERT(typeof node.parent === 'object');

            return node.parent;
        };

        var getRelid = function (node) {
            ASSERT(node.relid === null || typeof node.relid === 'string');

            return node.relid;
        };

        var getLevel = function (node) {
            var level = 0;
            while (node.parent !== null) {
                ++level;
                node = node.parent;
            }
            return level;
        };

        var getRoot = function (node) {
            while (node.parent !== null) {
                node = node.parent;
            }
            return node;
        };

        var getPath = function (node, base) {
            if (node === null) {
                return null;
            }

            var path = '';
            while (node.relid !== null && node !== base) {
                path = '/' + node.relid + path;
                node = node.parent;
            }
            return path;
        };

        var isValidPath = function (path) {
            return typeof path === 'string' && (path === '' || path.charAt(0) === '/');
        };

        var splitPath = function (path) {
            ASSERT(isValidPath(path));

            path = path.split('/');
            path.splice(0, 1);

            return path;
        };

        var buildPath = function (path) {
            ASSERT(path instanceof Array);

            return path.length === 0 ? '' : '/' + path.join('/');
        };

        var joinPaths = function (first, second) {
            ASSERT(isValidPath(first) && isValidPath(second));

            return first + second;
        };

        var getCommonPathPrefixData = function (first, second) {
            ASSERT(typeof first === 'string' && typeof second === 'string');

            first = splitPath(first);
            second = splitPath(second);

            var common = [];
            for (var i = 0; first[i] === second[i] && i < first.length; ++i) {
                common.push(first[i]);
            }

            return {
                common: buildPath(common),
                first: buildPath(first.slice(i)),
                firstLength: first.length - i,
                second: buildPath(second.slice(i)),
                secondLength: second.length - i
            };
        };

        // ------- memory management

        var __detachChildren = function (node) {
            ASSERT(node.children instanceof Array && node.age >= MAX_AGE - 1);

            var children = node.children;
            node.children = null;
            node.age = MAX_AGE;

            for (var i = 0; i < children.length; ++i) {
                __detachChildren(children[i]);
            }
        };

        var __ageNodes = function (nodes) {
            ASSERT(nodes instanceof Array);

            var i = nodes.length;
            while (--i >= 0) {
                var node = nodes[i];

                ASSERT(node.age < MAX_AGE);
                if (++node.age >= MAX_AGE) {
                    nodes.splice(i, 1);
                    __detachChildren(node);
                } else {
                    __ageNodes(node.children);
                }
            }
        };

        var __ageRoots = function () {
            if (++ticks >= MAX_TICKS) {
                ticks = 0;
                __ageNodes(roots);
            }
        };

        var __getChildNode = function (children, relid) {
            ASSERT(children instanceof Array && typeof relid === 'string');

            for (var i = 0; i < children.length; ++i) {
                var child = children[i];
                if (child.relid === relid) {
                    ASSERT(child.parent.age === 0);

                    child.age = 0;
                    return child;
                }
            }

            return null;
        };

        var __getChildData = function (data, relid) {
            ASSERT(typeof relid === 'string');

            if (typeof data === 'object' && data !== null) {
                data = data[relid];
                return typeof data === 'undefined' ? __getEmptyData() : data;
            } else {
                return null;
            }
        };

        var normalize = function (node) {
            ASSERT(isValidNode(node));
            // console.log('normalize start', printNode(getRoot(node)));

            var parent;

            if (node.children === null) {
                ASSERT(node.age === MAX_AGE);

                if (node.parent !== null) {
                    parent = normalize(node.parent);

                    var temp = __getChildNode(parent.children, node.relid);
                    if (temp !== null) {
                        // TODO: make the current node close to the returned one

                        // console.log('normalize end1',
                        // printNode(getRoot(temp)));
                        return temp;
                    }

                    ASSERT(node.parent.children === null || __getChildNode(node.parent.children, node.relid) === null);
                    ASSERT(__getChildNode(parent.children, node.relid) === null);

                    node.parent = parent;
                    parent.children.push(node);

                    temp = __getChildData(parent.data, node.relid);
                    if (!isValidHash(temp) || temp !== __getChildData(node.data, ID_NAME)) {
                        node.data = temp;
                    }
                } else {
                    roots.push(node);
                }

                node.age = 0;
                node.children = [];
            } else if (node.age !== 0) {
                parent = node;
                do {
                    parent.age = 0;
                    parent = parent.parent;
                } while (parent !== null && parent.age !== 0);
            }

            // console.log('normalize end2', printNode(getRoot(node)));
            return node;
        };

        // ------- hierarchy

        var getAncestor = function (first, second) {
            ASSERT(getRoot(first) === getRoot(second));

            first = normalize(first);
            second = normalize(second);

            var a = [];
            do {
                a.push(first);
                first = first.parent;
            } while (first !== null);

            var b = [];
            do {
                b.push(second);
                second = second.parent;
            } while (second !== null);

            var i = a.length - 1;
            var j = b.length - 1;
            while (i !== 0 && j !== 0 && a[i - 1] === b[j - 1]) {
                --i;
                --j;
            }

            ASSERT(a[i] === b[j]);
            return a[i];
        };

        var isAncestor = function (node, ancestor) {
            ASSERT(getRoot(node) === getRoot(ancestor));

            node = normalize(node);
            ancestor = normalize(ancestor);

            do {
                if (node === ancestor) {
                    return true;
                }

                node = node.parent;
            } while (node !== null);

            return false;
        };

        var createRoot = function () {
            var root = {
                parent: null,
                relid: null,
                age: 0,
                children: [],
                data: {
                    _mutable: true
                },
                rootid: ++rootCounter
            };
            root.data[ID_NAME] = '';
            roots.push(root);

            __ageRoots();
            return root;
        };

        var getChild = function (node, relid) {
            ASSERT(typeof relid === 'string' && relid !== ID_NAME);

            node = normalize(node);

            var child = __getChildNode(node.children, relid);
            if (child !== null) {
                return child;
            }

            child = {
                parent: node,
                relid: relid,
                age: 0,
                children: [],
                data: __getChildData(node.data, relid)
            };
            node.children.push(child);

            __ageRoots();
            return child;
        };

        var createChild = function (node) {
            node = normalize(node);

            if (typeof node.data !== 'object' || node.data === null) {
                throw new Error('invalid node data');
            }

            var relid = createRelid(node.data);
            var child = {
                parent: node,
                relid: relid,
                age: 0,
                children: [],
                data: __getEmptyData()
            };

            // TODO: make sure that it is not on the list
            node.children.push(child);

            __ageRoots();
            return child;
        };

        var getDescendant = function (node, head, base) {
            ASSERT(typeof base === 'undefined' || isAncestor(head, base));

            node = normalize(node);
            head = normalize(head);
            base = typeof base === 'undefined' ? null : normalize(base.parent);

            var path = [];
            while (head.parent !== base) {
                path.push(head.relid);
                head = head.parent;
            }

            var i = path.length;
            while (--i >= 0) {
                node = getChild(node, path[i]);
            }

            return node;
        };

        var getDescendantByPath = function (node, path) {
            ASSERT(path === '' || path.charAt(0) === '/');

            path = path.split('/');

            for (var i = 1; i < path.length; ++i) {
                node = getChild(node, path[i]);
            }

            return node;
        };

        // ------- data manipulation

        var __isMutableData = function (data) {
            return typeof data === 'object' && data !== null && data._mutable === true;
        };

        var isMutable = function (node) {
            node = normalize(node);
            return __isMutableData(node.data);
        };

        var isObject = function (node) {
            node = normalize(node);
            return typeof node.data === 'object' && node.data !== null;
        };

        var isEmpty = function (node) {
            node = normalize(node);
            if (typeof node.data !== 'object' || node.data === null) {
                return false;
            } else if (node.data === __getEmptyData()) {
                return true;
            }

            return __isEmptyData(node.data);
        };

        var __isEmptyData = function (data) {
            // TODO: better way to check if object has keys?
            for (var keys in data) {
                return false;
            }
            return true;
        };

        var __areEquivalent = function (data1, data2) {
            return data1 === data2 || (typeof data1 === 'string' && data1 === __getChildData(data2, ID_NAME)) ||
                (__isEmptyData(data1) && __isEmptyData(data2));
        };

        var mutateCount = 0;
        var mutate = function (node) {
            ASSERT(isValidNode(node));

            node = normalize(node);
            var data = node.data;

            if (typeof data !== 'object' || data === null) {
                return false;
            } else if (data._mutable === true) {
                return true;
            }

            // TODO: infinite cycle if MAX_MUTATE is smaller than depth!
            if (gmeConfig.storage.autoPersist && ++mutateCount > MAX_MUTATE) {
                mutateCount = 0;

                for (var i = 0; i < roots.length; ++i) {
                    if (__isMutableData(roots[i].data)) {
                        __saveData(roots[i].data);
                    }
                }
            }

            if (node.parent !== null && !mutate(node.parent)) {
                // this should never happen
                return false;
            }

            var copy = {
                _mutable: true
            };

            for (var key in data) {
                copy[key] = data[key];
            }

            ASSERT(copy._mutable === true);

            if (typeof data[ID_NAME] === 'string') {
                copy[ID_NAME] = '';
            }

            if (node.parent !== null) {
                ASSERT(__areEquivalent(__getChildData(node.parent.data, node.relid), node.data));
                node.parent.data[node.relid] = copy;
            }

            node.data = copy;
            return true;
        };

        var getData = function (node) {
            node = normalize(node);

            ASSERT(!__isMutableData(node.data));
            return node.data;
        };

        var __reloadChildrenData = function (node) {
            for (var i = 0; i < node.children.length; ++i) {
                var child = node.children[i];

                var data = __getChildData(node.data, child.relid);
                if (!isValidHash(data) || data !== __getChildData(child.data, ID_NAME)) {
                    child.data = data;
                    __reloadChildrenData(child);
                }
            }
        };

        var setData = function (node, data) {
            ASSERT(data !== null && typeof data !== 'undefined');

            node = normalize(node);
            if (node.parent !== null) {
                if (!mutate(node.parent)) {
                    throw new Error('incorrect node data');
                }

                node.parent.data[node.relid] = data;
            }

            node.data = data;
            __reloadChildrenData(node);
        };

        var deleteData = function (node) {
            node = normalize(node);

            if (node.parent !== null) {
                if (!mutate(node.parent)) {
                    throw new Error('incorrect node data');
                }

                delete node.parent.data[node.relid];
            }

            var data = node.data;

            node.data = __getEmptyData();
            __reloadChildrenData(node);

            return data;
        };

        var copyData = function (node) {
            node = normalize(node);

            if (typeof node.data !== 'object' || node.data === null) {
                return node.data;
            }

            // TODO: return immutable data without coping
            return JSON.parse(JSON.stringify(node.data));
        };

        var getProperty = function (node, name) {
            ASSERT(typeof name === 'string' && name !== ID_NAME);

            var data;
            node = normalize(node);

            if (typeof node.data === 'object' && node.data !== null) {
                data = node.data[name];
            }

            // TODO: corerel uses getProperty to get the overlay content which can get mutable
            // ASSERT(!__isMutableData(data));
            return data;
        };

        var setProperty = function (node, name, data) {
            ASSERT(typeof name === 'string' && name !== ID_NAME);
            ASSERT(!__isMutableData(data) /*&& data !== null*/ && data !== undefined);
            //TODO is the 'null' really can be a value of a property???

            node = normalize(node);
            if (!mutate(node)) {
                throw new Error('incorrect node data');
            }

            node.data[name] = data;

            var child = __getChildNode(node.children, name);
            if (child !== null) {
                child.data = data;
                __reloadChildrenData(child);
            }
        };

        var deleteProperty = function (node, name) {
            ASSERT(typeof name === 'string' && name !== ID_NAME);

            node = normalize(node);
            if (!mutate(node)) {
                throw new Error('incorrect node data');
            }

            delete node.data[name];

            var child = __getChildNode(node.children, name);
            if (child !== null) {
                child.data = __getEmptyData();
                __reloadChildrenData(child);
            }
        };

        var noUnderscore = function (relid) {
            ASSERT(typeof relid === 'string');
            return relid.charAt(0) !== '_';
        };

        var getKeys = function (node, predicate) {
            ASSERT(typeof predicate === 'undefined' || typeof predicate === 'function');

            node = normalize(node);
            predicate = predicate || noUnderscore;

            if (typeof node.data !== 'object' || node.data === null) {
                return null;
            }

            var keys = Object.keys(node.data);

            var i = keys.length;
            while (--i >= 0 && !predicate(keys[i])) {
                keys.pop();
            }

            while (--i >= 0) {
                if (!predicate(keys[i])) {
                    keys[i] = keys.pop();
                }
            }

            return keys;
        };

        var getRawKeys = function (object, predicate) {
            ASSERT(typeof predicate === 'undefined' || typeof predicate === 'function');
            predicate = predicate || noUnderscore;

            var keys = Object.keys(object);

            var i = keys.length;
            while (--i >= 0 && !predicate(keys[i])) {
                keys.pop();
            }

            while (--i >= 0) {
                if (!predicate(keys[i])) {
                    keys[i] = keys.pop();
                }
            }

            return keys;
        };

        // ------- persistence

        var getHash = function (node) {
            if (node === null) {
                return null;
            }

            var hash;
            node = normalize(node);
            if (typeof node.data === 'object' && node.data !== null) {
                hash = node.data[ID_NAME];
            }

            ASSERT(typeof hash === 'string' || typeof hash === 'undefined');
            return hash;
        };

        var isHashed = function (node) {
            node = normalize(node);
            return typeof node.data === 'object' && node.data !== null && typeof node.data[ID_NAME] === 'string';
        };

        var setHashed = function (node, hashed, noMutate) {
            ASSERT(typeof hashed === 'boolean');

            node = normalize(node);
            if (!noMutate) {
                if (!mutate(node)) {
                    throw new Error('incorrect node data');
                }
            }

            if (hashed) {
                node.data[ID_NAME] = '';
            } else {
                delete node.data[ID_NAME];
            }

            ASSERT(typeof node.children[ID_NAME] === 'undefined');
        };

        var __saveData = function (data) {
            ASSERT(__isMutableData(data));

            var done = __getEmptyData(),
                keys = Object.keys(data),
                i, child, sub, hash;

            delete data._mutable;

            for (i = 0; i < keys.length; i++) {
                child = data[keys[i]];
                if (__isMutableData(child)) {
                    sub = __saveData(child);
                    if (sub === __getEmptyData()) {
                        delete data[keys[i]];
                    } else {
                        done = sub;
                        if (typeof child[ID_NAME] === 'string') {
                            data[keys[i]] = child[ID_NAME];
                        }
                    }
                } else {
                    done = undefined;
                }
            }


            if (done !== __getEmptyData()) {
                hash = data[ID_NAME];
                ASSERT(hash === '' || typeof hash === 'undefined');

                if (hash === '') {
                    hash = '#' + GENKEY(data, gmeConfig);
                    data[ID_NAME] = hash;

                    done = data;
                    storage.insertObject(data, stackedObjects);
                    //stackedObjects[hash] = data;
                }
            }

            return done;
        };

        var persist = function (node) {
            var updated = false,
                result;

            node = normalize(node);

            if (!__isMutableData(node.data)) {
                return {rootHash: node.data[ID_NAME], objects: {}};
            }

            updated = __saveData(node.data);
            if (updated !== __getEmptyData()) {
                result = {};
                result.objects = stackedObjects;
                stackedObjects = {};
                result.rootHash = node.data[ID_NAME];
            } else {
                result = {rootHash: node.data[ID_NAME], objects: {}};
            }

            return result;
        };

        var loadRoot = function (hash) {
            ASSERT(isValidHash(hash));

            return TASYNC.call(__loadRoot2, storage.loadObject(hash));
        };

        var __loadRoot2 = function (data) {
            var root = {
                parent: null,
                relid: null,
                age: 0,
                children: [],
                data: data,
                rootid: ++rootCounter
            };
            roots.push(root);

            __ageRoots();
            return root;
        };

        var loadChild = function (node, relid) {
            ASSERT(isValidNode(node));

            node = getChild(node, relid);

            if (isValidHash(node.data)) {
                // TODO: this is a hack, we should avoid loading it multiple
                // times
                return TASYNC.call(__loadChild2, node, storage.loadObject(node.data));
            } else {
                return typeof node.data === 'object' && node.data !== null ? node : null;
            }
        };

        var getChildHash = function (node, relid) {
            ASSERT(isValidNode(node));

            node = getChild(node, relid);

            if (isValidHash(node.data)) {
                // TODO: this is a hack, we should avoid loading it multiple
                // times
                return node.data;
            } else {
                return typeof node.data === 'object' && node.data !== null ? getHash(node) : null;
            }
        };


        var __loadChild2 = function (node, newdata) {
            node = normalize(node);

            // TODO: this is a hack, we should avoid loading it multiple times
            if (isValidHash(node.data)) {
                ASSERT(node.data === newdata[ID_NAME]);

                node.data = newdata;
                __reloadChildrenData(node);
            } else {
                // TODO: if this bites you, use the Cache
                /*if(node.data !== newdata){
                 console.log('kecso',node);
                 }
                 ASSERT(node.data === newdata);*/
            }

            return node;
        };

        var loadByPath = function (node, path) {
            ASSERT(isValidNode(node));
            ASSERT(path === '' || path.charAt(0) === '/');

            path = path.split('/');
            return __loadDescendantByPath2(node, path, 1);
        };

        var __loadDescendantByPath2 = function (node, path, index) {
            if (node === null || index === path.length) {
                return node;
            }

            var child = loadChild(node, path[index]);
            return TASYNC.call(__loadDescendantByPath2, child, path, index + 1);
        };

        // ------- valid -------

        var printNode = function (node) {
            var str = '{';
            str += 'age:' + node.age;

            if (typeof node.relid === 'string') {
                str += ', relid: "' + node.relid + '"';
            }

            str += ', children:';
            if (node.children === null) {
                str += 'null';
            } else {
                str += '[';
                for (var i = 0; i < node.children.length; ++i) {
                    if (i !== 0) {
                        str += ', ';
                    }
                    str += printNode(node.children[i]);
                }
                str += ']';
            }

            str += '}';
            return str;
        };

        var __test = function (text, cond) {
            if (!cond) {
                throw new Error(text);
            }
        };

        var checkValidTree = function (node) {
            if (isValidNode(node)) {
                if (node.children instanceof Array) {
                    for (var i = 0; i < node.children.length; ++i) {
                        checkValidTree(node.children[i]);
                    }
                }
            }
        };

        // disable checking for now
        var checkValidTreeRunning = true;

        var isValidNode = function (node) {
            try {
                __test('object', typeof node === 'object' && node !== null);
                __test('object 2', node.hasOwnProperty('parent') && node.hasOwnProperty('relid'));
                __test('parent', typeof node.parent === 'object');
                __test('relid', typeof node.relid === 'string' || node.relid === null);
                __test('parent 2', (node.parent === null) === (node.relid === null));
                __test('age', node.age >= 0 && node.age <= MAX_AGE);
                __test('children', node.children === null || node.children instanceof Array);
                __test('children 2', (node.age === MAX_AGE) === (node.children === null));
                __test('data', typeof node.data === 'object' || typeof node.data === 'string' ||
                    typeof node.data === 'number');

                if (node.parent !== null) {
                    __test('age 2', node.age >= node.parent.age);
                    __test('mutable', !__isMutableData(node.data) || __isMutableData(node.parent.data));
                }

                if (!checkValidTreeRunning) {
                    checkValidTreeRunning = true;
                    checkValidTree(getRoot(node));
                    checkValidTreeRunning = false;
                }

                return true;
            } catch (error) {
                logger.error(error.message, {stack: error.stack, node: node});
                return false;
            }
        };

        return {
            getParent: getParent,
            getRelid: getRelid,
            getLevel: getLevel,
            getRoot: getRoot,
            getPath: getPath,
            isValidPath: isValidPath,
            splitPath: splitPath,
            buildPath: buildPath,
            joinPaths: joinPaths,
            getCommonPathPrefixData: getCommonPathPrefixData,

            normalize: normalize,
            getAncestor: getAncestor,
            isAncestor: isAncestor,
            createRoot: createRoot,
            createChild: createChild,
            getChild: getChild,
            getDescendant: getDescendant,
            getDescendantByPath: getDescendantByPath,

            isMutable: isMutable,
            isObject: isObject,
            isEmpty: isEmpty,
            mutate: mutate,
            getData: getData,
            setData: setData,
            deleteData: deleteData,
            copyData: copyData,
            getProperty: getProperty,
            setProperty: setProperty,
            deleteProperty: deleteProperty,
            getKeys: getKeys,
            getRawKeys: getRawKeys,

            isHashed: isHashed,
            setHashed: setHashed,
            getHash: getHash,
            persist: persist,
            loadRoot: loadRoot,
            loadChild: loadChild,
            loadByPath: loadByPath,

            isValidNode: isValidNode,

            getChildHash: getChildHash
        };
    };
});

/*globals define*/
/*jshint node: true, browser: true*/

/**
 * @author mmaroti / https://github.com/mmaroti
 */

define('common/core/corerel',['common/util/assert', 'common/core/coretree', 'common/core/tasync'], function (ASSERT, CoreTree, TASYNC) {

    

    // ----------------- RELID -----------------

    var ATTRIBUTES = 'atr';
    var REGISTRY = 'reg';
    var OVERLAYS = 'ovr';
    var COLLSUFFIX = '-inv';

    function isPointerName(name) {
        ASSERT(typeof name === 'string');
        //TODO this is needed as now we work with modified data as well
        if (name === '_mutable') {
            return false;
        }
        return name.slice(-COLLSUFFIX.length) !== COLLSUFFIX;
    }

    function isValidRelid(relid) {
        return typeof relid === 'string' && parseInt(relid, 10).toString() === relid;
    }

    function __test(text, cond) {
        if (!cond) {
            throw new Error(text);
        }
    }

    // ----------------- Core -----------------

    function CoreRel(coretree, options) {
        ASSERT(typeof options === 'object');
        ASSERT(typeof options.globConf === 'object');
        ASSERT(typeof options.logger !== 'undefined');
        ASSERT(typeof coretree === 'object');

        var logger = options.logger.fork('corerel');

        logger.debug('initialized');

        function isValidNode(node) {
            try {
                __test('coretree', coretree.isValidNode(node));
                __test('isobject', coretree.isObject(node));

                return true;
            } catch (error) {
                logger.error(error.message, {stack: error.stack, node: node});
                return false;
            }
        }

        function getAttributeNames(node) {
            ASSERT(isValidNode(node));

            node = (coretree.getProperty(node, ATTRIBUTES) || {});
            var keys = coretree.getRawKeys(node);
            var i = keys.length;
            while (--i >= 0) {
                if (keys[i].charAt(0) === '') {
                    console.log('***** This happens?');
                    keys.splice(i, 1);
                }
            }

            return keys;
        }

        function getRegistryNames(node) {
            ASSERT(isValidNode(node));

            node = (coretree.getProperty(node, REGISTRY) || {});
            var keys = coretree.getRawKeys(node);
            var i = keys.length;
            while (--i >= 0) {
                if (keys[i].charAt(0) === '') {
                    console.log('***** This happens?');
                    keys.splice(i, 1);
                }
            }

            return keys;
        }

        function getAttribute(node, name) {
            /*node = coretree.getChild(node, ATTRIBUTES);
             return coretree.getProperty(node, name);*/
            return (coretree.getProperty(node, ATTRIBUTES) || {})[name];
        }

        function delAttribute(node, name) {
            node = coretree.getChild(node, ATTRIBUTES);
            coretree.deleteProperty(node, name);
        }

        function setAttribute(node, name, value) {
            node = coretree.getChild(node, ATTRIBUTES);
            coretree.setProperty(node, name, value);
        }

        function getRegistry(node, name) {
            /*node = coretree.getChild(node, REGISTRY);
             return coretree.getProperty(node, name);*/
            return (coretree.getProperty(node, REGISTRY) || {})[name];
        }

        function delRegistry(node, name) {
            node = coretree.getChild(node, REGISTRY);
            coretree.deleteProperty(node, name);
        }

        function setRegistry(node, name, value) {
            node = coretree.getChild(node, REGISTRY);
            coretree.setProperty(node, name, value);
        }

        function overlayInsert(overlays, source, name, target) {
            ASSERT(isValidNode(overlays) && coretree.getRelid(overlays) === OVERLAYS);
            ASSERT(coretree.isValidPath(source) && coretree.isValidPath(target) && isPointerName(name));
            ASSERT(coretree.getCommonPathPrefixData(source, target).common === '');

            // console.log('insert', overlays.parent.data.atr.name, source, name, target);

            var node = coretree.getChild(overlays, source);

            ASSERT(coretree.getProperty(node, name) === undefined);
            coretree.setProperty(node, name, target);

            node = coretree.getChild(overlays, target);
            name = name + COLLSUFFIX;

            var array = coretree.getProperty(node, name);
            if (array) {
                ASSERT(array.indexOf(source) < 0);

                array = array.slice(0);
                array.push(source);
            } else {
                array = [source];
            }

            coretree.setProperty(node, name, array);
        }

        function overlayRemove(overlays, source, name, target) {
            ASSERT(isValidNode(overlays) && coretree.getRelid(overlays) === OVERLAYS);
            ASSERT(coretree.isValidPath(source) && coretree.isValidPath(target) && isPointerName(name));
            ASSERT(coretree.getCommonPathPrefixData(source, target).common === '');

            // console.log('remove', overlays.parent.data.atr.name, source, name, target);

            var node = coretree.getChild(overlays, source);
            ASSERT(node && coretree.getProperty(node, name) === target);
            coretree.deleteProperty(node, name);

            node = coretree.getChild(overlays, target);
            ASSERT(node);

            name = name + COLLSUFFIX;

            var array = coretree.getProperty(node, name);
            ASSERT(Array.isArray(array) && array.length >= 1);

            if (array.length === 1) {
                ASSERT(array[0] === source);

                coretree.deleteProperty(node, name);
            } else {
                var index = array.indexOf(source);
                ASSERT(index >= 0);

                array = array.slice(0);
                array.splice(index, 1);

                coretree.setProperty(node, name, array);
            }
        }

        function overlayQuery(overlays, prefix) {
            ASSERT(isValidNode(overlays) && coretree.isValidPath(prefix));

            var prefix2 = prefix + '/';
            var list = [];
            var paths = coretree.getKeys(overlays);

            for (var i = 0; i < paths.length; ++i) {
                var path = paths[i];
                if (path === prefix || path.substr(0, prefix2.length) === prefix2) {
                    var node = coretree.getChild(overlays, path);
                    var names = coretree.getKeys(node);
                    
                    for (var j = 0; j < names.length; ++j) {
                        var name = names[j];
                        if (isPointerName(name)) {
                            list.push({
                                s: path,
                                n: name,
                                t: coretree.getProperty(node, name),
                                p: true
                            });
                        } else {
                            var array = coretree.getProperty(node, name);
                            ASSERT(Array.isArray(array));
                            name = name.slice(0, -COLLSUFFIX.length);
                            for (var k = 0; k < array.length; ++k) {
                                list.push({
                                    s: array[k],
                                    n: name,
                                    t: path,
                                    p: false
                                });
                            }
                        }
                    }
                }
            }

            // console.log('query', overlays.parent.data.atr.name, prefix, list);

            return list;
        }

        function createNode(parameters) {
            parameters = parameters || {};
            var relid = parameters.relid,
                parent = parameters.parent;

            ASSERT(!parent || isValidNode(parent));
            ASSERT(!relid || typeof relid === 'string');

            var node;
            if (parent) {
                if (relid) {
                    node = coretree.getChild(parent, relid);
                } else {
                    node = coretree.createChild(parent);
                }
                coretree.setHashed(node, true);
            } else {
                node = coretree.createRoot();
            }

            return node;
        }

        function deleteNode(node) {
            ASSERT(isValidNode(node));

            var parent = coretree.getParent(node);
            var prefix = '/' + coretree.getRelid(node);
            ASSERT(parent !== null);

            coretree.deleteProperty(parent, coretree.getRelid(node));

            while (parent) {
                var overlays = coretree.getChild(parent, OVERLAYS);

                var list = overlayQuery(overlays, prefix);
                for (var i = 0; i < list.length; ++i) {
                    var entry = list[i];
                    overlayRemove(overlays, entry.s, entry.n, entry.t);
                }

                prefix = '/' + coretree.getRelid(parent) + prefix;
                parent = coretree.getParent(parent);
            }
        }

        function copyNode(node, parent) {
            ASSERT(isValidNode(node));
            ASSERT(!parent || isValidNode(parent));

            node = coretree.normalize(node);
            var newNode;

            if (parent) {
                var ancestor = coretree.getAncestor(node, parent);

                // cannot copy inside of itself
                if (ancestor === node) {
                    return null;
                }

                newNode = coretree.createChild(parent);
                coretree.setHashed(newNode, true);
                coretree.setData(newNode, coretree.copyData(node));

                var ancestorOverlays = coretree.getChild(ancestor, OVERLAYS);
                var ancestorNewPath = coretree.getPath(newNode, ancestor);

                var base = coretree.getParent(node);
                var baseOldPath = '/' + coretree.getRelid(node);
                var aboveAncestor = 1;

                while (base) {
                    var baseOverlays = coretree.getChild(base, OVERLAYS);
                    var list = overlayQuery(baseOverlays, baseOldPath);
                    var tempAncestor = coretree.getAncestor(base, ancestor);

                    aboveAncestor = (base === ancestor ? 0 : tempAncestor === base ? 1 : -1);

                    var relativePath = aboveAncestor < 0 ?
                        coretree.getPath(base, ancestor) : coretree.getPath(ancestor, base);

                    for (var i = 0; i < list.length; ++i) {
                        var entry = list[i];

                        if (entry.p) {
                            ASSERT(entry.s.substr(0, baseOldPath.length) === baseOldPath);
                            ASSERT(entry.s === baseOldPath || entry.s.charAt(baseOldPath.length) === '/');

                            var source, target, overlays;

                            if (aboveAncestor < 0) {
                                //below ancestor node - further from root
                                source = ancestorNewPath + entry.s.substr(baseOldPath.length);
                                target = coretree.joinPaths(relativePath, entry.t);
                                overlays = ancestorOverlays;
                            } else if (aboveAncestor === 0) {
                                //at ancestor node
                                var data = coretree.getCommonPathPrefixData(ancestorNewPath, entry.t);

                                overlays = newNode;
                                while (data.firstLength-- > 0) {
                                    overlays = coretree.getParent(overlays);
                                }
                                overlays = coretree.getChild(overlays, OVERLAYS);

                                source = coretree.joinPaths(data.first, entry.s.substr(baseOldPath.length));
                                target = data.second;
                            } else {
                                //above ancestor node - closer to root
                                ASSERT(entry.s.substr(0, baseOldPath.length) === baseOldPath);

                                source = relativePath + ancestorNewPath + entry.s.substr(baseOldPath.length);
                                target = entry.t;
                                overlays = baseOverlays;
                            }

                            overlayInsert(overlays, source, entry.n, target);
                        }
                    }

                    baseOldPath = '/' + coretree.getRelid(base) + baseOldPath;
                    base = coretree.getParent(base);
                }
            } else {
                newNode = coretree.createRoot();
                coretree.setData(newNode, coretree.copyData(node));
            }

            return newNode;
        }

        //kecso
        function copyNodes(nodes, parent) {
            //copying multiple nodes at once for keeping their internal relations
            var paths = [],
                i, j, index, names, pointer,
                copiedNodes = [],
                internalRelationPaths = []; // Every single element will be an object with the
                                            // internally pointing relations and the index of the target.

            for (i = 0; i < nodes.length; i++) {
                paths.push(coretree.getPath(nodes[i]));
            }

            for (i = 0; i < nodes.length; i++) {
                names = getPointerNames(nodes[i]);
                pointer = {};
                for (j = 0; j < names.length; j++) {
                    index = paths.indexOf(getPointerPath(nodes[i], names[j]));
                    if (index !== -1) {
                        pointer[names[j]] = index;
                    }
                }
                internalRelationPaths.push(pointer);
            }

            //now we use our simple copy
            for (i = 0; i < nodes.length; i++) {
                copiedNodes.push(copyNode(nodes[i], parent));
            }

            //and now back to the relations
            for (i = 0; i < internalRelationPaths.length; i++) {
                names = Object.keys(internalRelationPaths[i]);
                for (j = 0; j < names.length; j++) {
                    setPointer(copiedNodes[i], names[j], copiedNodes[internalRelationPaths[i][names[j]]]);
                }
            }

            return copiedNodes;
        }

        function moveNode(node, parent) {
            ASSERT(isValidNode(node) && isValidNode(parent));

            node = coretree.normalize(node);
            var ancestor = coretree.getAncestor(node, parent);

            // cannot move inside of itself
            if (ancestor === node) {
                return null;
            }

            var base = coretree.getParent(node);
            var baseOldPath = '/' + coretree.getRelid(node);
            var aboveAncestor = 1;

            var oldNode = node;
            node = coretree.getChild(parent, coretree.getRelid(oldNode));
            if (!coretree.isEmpty(node)) {
                // we have to change the relid of the node, to fit into its new
                // place...
                node = coretree.createChild(parent);
            }
            coretree.setHashed(node, true);
            coretree.setData(node, coretree.copyData(oldNode));

            var ancestorOverlays = coretree.getChild(ancestor, OVERLAYS);
            var ancestorNewPath = coretree.getPath(node, ancestor);

            while (base) {
                var baseOverlays = coretree.getChild(base, OVERLAYS);
                var list = overlayQuery(baseOverlays, baseOldPath);
                var tempAncestor = coretree.getAncestor(base, ancestor);

                aboveAncestor = (base === ancestor ? 0 : tempAncestor === base ? 1 : -1);

                var relativePath = aboveAncestor < 0 ?
                    coretree.getPath(base, ancestor) : coretree.getPath(ancestor, base);

                for (var i = 0; i < list.length; ++i) {
                    var entry = list[i];

                    overlayRemove(baseOverlays, entry.s, entry.n, entry.t);

                    var tmp;
                    if (!entry.p) {
                        tmp = entry.s;
                        entry.s = entry.t;
                        entry.t = tmp;
                    }

                    ASSERT(entry.s.substr(0, baseOldPath.length) === baseOldPath);
                    ASSERT(entry.s === baseOldPath || entry.s.charAt(baseOldPath.length) === '/');

                    var source, target, overlays;

                    if (aboveAncestor < 0) {
                        //below ancestor node
                        source = ancestorNewPath + entry.s.substr(baseOldPath.length);
                        target = coretree.joinPaths(relativePath, entry.t);
                        overlays = ancestorOverlays;
                    } else if (aboveAncestor === 0) {
                        //at ancestor node
                        var data = coretree.getCommonPathPrefixData(ancestorNewPath, entry.t);

                        overlays = node;
                        while (data.firstLength-- > 0) {
                            overlays = coretree.getParent(overlays);
                        }
                        overlays = coretree.getChild(overlays, OVERLAYS);

                        source = coretree.joinPaths(data.first, entry.s.substr(baseOldPath.length));
                        target = data.second;
                    } else {
                        //above ancestor node
                        ASSERT(entry.s.substr(0, baseOldPath.length) === baseOldPath);

                        source = relativePath + ancestorNewPath + entry.s.substr(baseOldPath.length);
                        target = entry.t;
                        overlays = baseOverlays;
                    }

                    if (!entry.p) {
                        tmp = entry.s;
                        entry.s = entry.t;
                        entry.t = tmp;

                        tmp = source;
                        source = target;
                        target = tmp;
                    }

                    //console.log(source, target);
                    overlayInsert(overlays, source, entry.n, target);
                }

                baseOldPath = '/' + coretree.getRelid(base) + baseOldPath;
                base = coretree.getParent(base);
            }

            deleteNode(oldNode);

            return node;
        }

        function getChildrenRelids(node) {
            ASSERT(isValidNode(node));

            return coretree.getKeys(node, isValidRelid);
        }

        function getChildrenPaths(node) {
            var path = coretree.getPath(node);

            var relids = getChildrenRelids(node);
            for (var i = 0; i < relids.length; ++i) {
                relids[i] = path + '/' + relids[i];
            }

            return relids;
        }

        function loadChildren(node) {
            ASSERT(isValidNode(node));

            var children = coretree.getKeys(node, isValidRelid);
            for (var i = 0; i < children.length; ++i) {
                children[i] = coretree.loadChild(node, children[i]);
            }

            return TASYNC.lift(children);
        }

        function getPointerNames(node) {
            ASSERT(isValidNode(node));

            var source = '';
            var names = [];

            do {
                var child = (coretree.getProperty(node, OVERLAYS) || {})[source];
                if (child) {
                    for (var name in child) {
                        ASSERT(names.indexOf(name) === -1);
                        if (isPointerName(name)) {
                            names.push(name);
                        }
                    }
                }

                source = '/' + coretree.getRelid(node) + source;
                node = coretree.getParent(node);
            } while (node);

            return names;
        }

        function getPointerPath(node, name) {
            ASSERT(isValidNode(node) && typeof name === 'string');

            var source = '';
            var target;

            do {
                var child = (coretree.getProperty(node, OVERLAYS) || {})[source];
                if (child) {
                    target = child[name];
                    if (target !== undefined) {
                        break;
                    }
                }

                source = '/' + coretree.getRelid(node) + source;
                node = coretree.getParent(node);
            } while (node);

            if (target !== undefined) {
                ASSERT(node);
                target = coretree.joinPaths(coretree.getPath(node), target);
            }

            return target;
        }

        function hasPointer(node, name) {
            ASSERT(isValidNode(node) && typeof name === 'string');

            var source = '';

            do {
                var child = (coretree.getProperty(node, OVERLAYS) || {})[source];
                if (child && child[name] !== undefined) {
                    return true;
                }

                source = '/' + coretree.getRelid(node) + source;
                node = coretree.getParent(node);
            } while (node);

            return false;
        }

        function getOutsidePointerPath(node, name, source) {
            ASSERT(isValidNode(node) && typeof name === 'string');
            ASSERT(typeof source === 'string');

            var target;

            do {
                var child = (coretree.getProperty(node, OVERLAYS) || {})[source];
                if (child) {
                    target = child[name];
                    if (target !== undefined) {
                        break;
                    }
                }

                source = '/' + coretree.getRelid(node) + source;
                node = coretree.getParent(node);
            } while (node);

            if (target !== undefined) {
                ASSERT(node);
                target = coretree.joinPaths(coretree.getPath(node), target);
            }

            return target;
        }

        function loadPointer(node, name) {
            ASSERT(isValidNode(node) && name);

            var source = '';
            var target;

            do {
                var child = (coretree.getProperty(node, OVERLAYS) || {})[source];
                if (child) {
                    target = child[name];
                    if (target !== undefined) {
                        break;
                    }
                }

                source = '/' + coretree.getRelid(node) + source;
                node = coretree.getParent(node);
            } while (node);

            if (target !== undefined) {
                ASSERT(typeof target === 'string' && node);
                return coretree.loadByPath(node, target);
            } else {
                return null;
            }
        }

        function getCollectionNames(node) {
            ASSERT(isValidNode(node));

            var target = '';
            var names = [];

            do {
                var child = coretree.getProperty(coretree.getChild(node, OVERLAYS), target);
                if (child) {
                    for (var name in child) {
                        if (!isPointerName(name) && name !== '_mutable') {
                            name = name.slice(0, -COLLSUFFIX.length);
                            if (isPointerName(name) && names.indexOf(name) < 0) {
                                names.push(name);
                            }
                        }
                    }
                }

                target = '/' + coretree.getRelid(node) + target;
                node = coretree.getParent(node);
            } while (node);

            return names;
        }

        function loadCollection(node, name) {
            ASSERT(isValidNode(node) && name);

            name += COLLSUFFIX;

            var collection = [];
            var target = '';

            do {
                var child = coretree.getChild(node, OVERLAYS);

                child = coretree.getChild(child, target);
                if (child) {
                    var sources = coretree.getProperty(child, name);
                    if (sources) {
                        ASSERT(Array.isArray(sources) && sources.length >= 1);

                        for (var i = 0; i < sources.length; ++i) {
                            collection.push(coretree.loadByPath(node, sources[i]));
                        }
                    }
                }

                target = '/' + coretree.getRelid(node) + target;
                node = coretree.getParent(node);
            } while (node);

            return TASYNC.lift(collection);
        }

        function getCollectionPaths(node, name) {
            ASSERT(isValidNode(node) && name);

            name += COLLSUFFIX;

            var result = [];
            var target = '';

            do {
                var child = coretree.getChild(node, OVERLAYS);

                child = coretree.getChild(child, target);
                if (child) {
                    var sources = coretree.getProperty(child, name);
                    if (sources) {
                        ASSERT(Array.isArray(sources) && sources.length >= 1);

                        var prefix = coretree.getPath(node);

                        for (var i = 0; i < sources.length; ++i) {
                            result.push(coretree.joinPaths(prefix, sources[i]));
                        }
                    }
                }

                target = '/' + coretree.getRelid(node) + target;
                node = coretree.getParent(node);
            } while (node);

            return result;
        }

        function deletePointer(node, name) {
            ASSERT(isValidNode(node) && typeof name === 'string');

            var source = '';

            do {
                var overlays = coretree.getChild(node, OVERLAYS);
                ASSERT(overlays);

                var target = coretree.getProperty(coretree.getChild(overlays, source), name);
                if (target !== undefined) {
                    overlayRemove(overlays, source, name, target);
                    return true;
                }

                source = '/' + coretree.getRelid(node) + source;
                node = coretree.getParent(node);
            } while (node);

            return false;
        }

        function setPointer(node, name, target) {
            ASSERT(isValidNode(node) && typeof name === 'string' && (!target || isValidNode(target)));

            deletePointer(node, name);

            if (target) {
                var ancestor = coretree.getAncestor(node, target);

                var overlays = coretree.getChild(ancestor, OVERLAYS);
                var sourcePath = coretree.getPath(node, ancestor);
                var targetPath = coretree.getPath(target, ancestor);

                overlayInsert(overlays, sourcePath, name, targetPath);
            }
        }

        function getChildrenHashes(node) {
            var keys = getChildrenRelids(node),
                i, hashes = {};

            for (i = 0; i < keys.length; i++) {
                hashes[keys[i]] = coretree.getChildHash(node, keys[i]);
            }

            return hashes;
        }

        // copy everything from coretree
        var corerel = {};
        for (var key in coretree) {
            corerel[key] = coretree[key];
        }

        corerel.isValidNode = isValidNode;
        corerel.isValidRelid = isValidRelid;

        corerel.getChildrenRelids = getChildrenRelids;
        corerel.getChildrenPaths = getChildrenPaths;

        corerel.loadChildren = loadChildren;
        corerel.createNode = createNode;
        corerel.deleteNode = deleteNode;
        corerel.copyNode = copyNode;
        corerel.copyNodes = copyNodes;
        corerel.moveNode = moveNode;

        corerel.getAttributeNames = getAttributeNames;
        corerel.getAttribute = getAttribute;
        corerel.setAttribute = setAttribute;
        corerel.delAttribute = delAttribute;

        corerel.getRegistryNames = getRegistryNames;
        corerel.getRegistry = getRegistry;
        corerel.setRegistry = setRegistry;
        corerel.delRegistry = delRegistry;

        corerel.getPointerNames = getPointerNames;
        corerel.getPointerPath = getPointerPath;
        corerel.hasPointer = hasPointer;
        corerel.getOutsidePointerPath = getOutsidePointerPath;
        corerel.loadPointer = loadPointer;
        corerel.deletePointer = deletePointer;
        corerel.setPointer = setPointer;
        corerel.getCollectionNames = getCollectionNames;
        corerel.getCollectionPaths = getCollectionPaths;
        corerel.loadCollection = loadCollection;

        corerel.getCoreTree = function () {
            return coretree;
        };

        corerel.getChildrenHashes = getChildrenHashes;

        corerel.overlayInsert = overlayInsert;

        return corerel;
    }

    return CoreRel;
});

/*globals define*/
/*jshint node: true, browser: true*/

/**
 * @author kecso / https://github.com/kecso
 */

define('common/core/setcore',['common/util/assert'], function (ASSERT) {
    

    var SETS_ID = '_sets';
    var REL_ID = 'member';

    function SetCore(innerCore, options) {
        ASSERT(typeof options === 'object');
        ASSERT(typeof options.globConf === 'object');
        ASSERT(typeof options.logger !== 'undefined');

        var logger = options.logger.fork('setcore');
        //help functions
        var setModified = function (node) {
            innerCore.setRegistry(node, '_sets_', (innerCore.getRegistry(node, '_sets_') || 0) + 1);
        };
        var getMemberPath = function (node, setElementNode) {
            var ownPath = innerCore.getPath(node),
                memberPath = innerCore.getPointerPath(setElementNode, REL_ID);

            //TODO this is a hack and should be solved some other way if possible
            ownPath = ownPath.substring(0, ownPath.indexOf('/_'));

            if (ownPath !== memberPath) {
                return memberPath;
            }

            //now we should check who really set this member as its own
            while (innerCore.getBase(node) !== null && innerCore.getBase(setElementNode) !== null &&
            innerCore.getRegistry(innerCore.getBase(setElementNode), '_') === '_') {

                node = innerCore.getBase(node);
                setElementNode = innerCore.getBase(setElementNode);
                ownPath = innerCore.getPath(node);

                //TODO this is a hack and should be solved some other way if possible
                ownPath = ownPath.substring(0, ownPath.indexOf('/_'));
            }
            memberPath = innerCore.getPointerPath(setElementNode, REL_ID);


            return memberPath;

        };
        var getMemberRelId = function (node, setName, memberPath) {
            ASSERT(typeof setName === 'string');
            var setNode = innerCore.getChild(innerCore.getChild(node, SETS_ID), setName);
            var elements = innerCore.getChildrenRelids(setNode);

            for (var i = 0; i < elements.length; i++) {
                if (getMemberPath(node, innerCore.getChild(setNode, elements[i])) === memberPath) {
                    return elements[i];
                }
            }
            return null;
        };
        var createNewMemberRelid = function (setNode) {
            var MAX_RELID = Math.pow(2, 31);
            var existingRelIds = innerCore.getChildrenRelids(setNode);
            var relid;
            do {
                relid = Math.floor(Math.random() * MAX_RELID);
            } while (existingRelIds.indexOf(relid) !== -1);
            return '' + relid;
        };

        var harmonizeMemberData = function (node, setName) {
            var setNode = innerCore.getChild(innerCore.getChild(node, SETS_ID), setName),
                base = innerCore.getBase(setNode),
                allMembers = innerCore.getChildrenRelids(setNode),
                ownMembers, inheritedMembers, i, j, path, names, ownMember, inheritedMember, k;
            if (base) {
                harmonizeMemberData(base, setName); //recursively harmonize base members first
                inheritedMembers = innerCore.getChildrenRelids(base);
                ownMembers = [];
                for (i = 0; i < allMembers.length; i++) {
                    if (inheritedMembers.indexOf(allMembers[i]) === -1) {
                        ownMembers.push(allMembers[i]);
                    }
                }

                for (i = 0; i < ownMembers.length; i++) {
                    ownMember = innerCore.getChild(setNode, ownMembers[i]);
                    path = innerCore.getPointerPath(ownMember, 'member');
                    for (j = 0; j < inheritedMembers.length; j++) {
                        inheritedMember = innerCore.getChild(setNode, inheritedMembers[j]);
                        if (getMemberPath(node, inheritedMember) === path) {
                            //redundancy...
                            names = innerCore.getAttributeNames(ownMember);
                            for (k = 0; k < names.length; k++) {
                                if (innerCore.getAttribute(ownMember, names[k]) !==
                                    innerCore.getAttribute(inheritedMember, names[k])) {

                                    innerCore.setAttribute(inheritedMember, names[k],
                                        innerCore.getAttribute(ownMember, names[k]));
                                }
                            }
                            names = innerCore.getRegistryNames(ownMember);
                            for (k = 0; k < names.length; k++) {
                                if (innerCore.getRegistry(ownMember, names[k]) !==
                                    innerCore.getRegistry(inheritedMember, names[k])) {

                                    innerCore.setRegistry(inheritedMember, names[k],
                                        innerCore.getRegistry(ownMember, names[k]));
                                }
                            }
                            innerCore.deleteNode(innerCore.getChild(setNode, ownMembers[i]), true);
                        }
                    }
                }
            }
        };

        //copy lower layer
        var setcore = {};
        for (var i in innerCore) {
            setcore[i] = innerCore[i];
        }
        logger.debug('initialized');
        //adding new functions
        setcore.getSetNumbers = function (node) {
            return this.getSetNames(node).length;
        };

        setcore.getSetNames = function (node) {
            return innerCore.getPointerNames(innerCore.getChild(node, SETS_ID)) || [];
        };

        setcore.getPointerNames = function (node) {
            var sorted = [],
                raw = innerCore.getPointerNames(node);
            for (var i = 0; i < raw.length; i++) {
                if (raw[i].indexOf(REL_ID) === -1) {
                    sorted.push(raw[i]);
                }
            }
            return sorted;
        };

        setcore.getCollectionNames = function (node) {
            var sorted = [],
                raw = innerCore.getCollectionNames(node);
            for (var i = 0; i < raw.length; i++) {
                if (raw[i].indexOf(REL_ID) === -1) {
                    sorted.push(raw[i]);
                }
            }
            return sorted;
        };

        setcore.getMemberPaths = function (node, setName) {
            ASSERT(typeof setName === 'string');
            harmonizeMemberData(node, setName);
            var setNode = innerCore.getChild(innerCore.getChild(node, SETS_ID), setName);
            var members = [];
            var elements = innerCore.getChildrenRelids(setNode);
            elements = elements.sort(); //TODO this should be removed at some point
            for (var i = 0; i < elements.length; i++) {
                var path = getMemberPath(node, innerCore.getChild(setNode, elements[i]));
                if (path) {
                    members.push(path);
                }
            }
            return members;
        };

        setcore.delMember = function (node, setName, memberPath) {
            ASSERT(typeof setName === 'string');
            harmonizeMemberData(node, setName);
            //we only need the path of the member so we allow to enter only it
            if (typeof memberPath !== 'string') {
                memberPath = innerCore.getPath(memberPath);
            }

            var setMemberRelId = getMemberRelId(node, setName, memberPath);
            if (setMemberRelId) {
                var setMemberNode = innerCore.getChild(
                    innerCore.getChild(innerCore.getChild(node, SETS_ID), setName), setMemberRelId);

                innerCore.deleteNode(setMemberNode, true);
                setModified(node);
            }
        };

        setcore.addMember = function (node, setName, member) {
            ASSERT(typeof setName === 'string');
            var setsNode = innerCore.getChild(node, SETS_ID);
            //TODO decide if the member addition should really create the set or it should fail...
            if (innerCore.getPointerPath(setsNode, setName) === undefined) {
                setcore.createSet(node, setName);
            }
            harmonizeMemberData(node, setName);
            var setNode = innerCore.getChild(setsNode, setName);
            var setMemberRelId = getMemberRelId(node, setName, setcore.getPath(member));
            if (setMemberRelId === null) {
                var setMember = innerCore.getChild(setNode, createNewMemberRelid(setNode));
                innerCore.setPointer(setMember, 'member', member);

                //TODO hack, somehow the empty children have been removed during persist
                innerCore.setRegistry(setMember, '_', '_');
                setModified(node);
            }
        };

        //TODO: Refactor out getMemberNode:
        //TODO: var memberNode = innerCore.getChild(
        //TODO: innerCore.getChild(innerCore.getChild(node, SETS_ID), setName), memberRelId);

        setcore.getMemberAttributeNames = function (node, setName, memberPath) {
            ASSERT(typeof setName === 'string');
            harmonizeMemberData(node, setName);
            var memberRelId = getMemberRelId(node, setName, memberPath);
            if (memberRelId) {
                var memberNode = innerCore.getChild(
                    innerCore.getChild(innerCore.getChild(node, SETS_ID), setName), memberRelId);

                return innerCore.getAttributeNames(memberNode);
            }
            return [];
        };

        setcore.getMemberOwnAttributeNames = function (node, setName, memberPath) {
            ASSERT(typeof setName === 'string');
            var memberRelId = getMemberRelId(node, setName, memberPath);
            if (memberRelId) {
                var memberNode = innerCore.getChild(
                    innerCore.getChild(innerCore.getChild(node, SETS_ID), setName), memberRelId);

                return innerCore.getOwnAttributeNames(memberNode);
            }
            return [];
        };

        setcore.getMemberAttribute = function (node, setName, memberPath, attrName) {
            ASSERT(typeof setName === 'string' && typeof attrName === 'string');
            harmonizeMemberData(node, setName);
            var memberRelId = getMemberRelId(node, setName, memberPath);
            if (memberRelId) {
                var memberNode = innerCore.getChild(
                    innerCore.getChild(innerCore.getChild(node, SETS_ID), setName), memberRelId);

                return innerCore.getAttribute(memberNode, attrName);
            }
        };

        setcore.setMemberAttribute = function (node, setName, memberPath, attrName, attrValue) {
            ASSERT(typeof setName === 'string' && typeof attrName === 'string' && attrValue !== undefined);
            harmonizeMemberData(node, setName);
            var memberRelId = getMemberRelId(node, setName, memberPath);
            if (memberRelId) {
                var memberNode = innerCore.getChild(
                    innerCore.getChild(innerCore.getChild(node, SETS_ID), setName), memberRelId);

                innerCore.setAttribute(memberNode, attrName, attrValue);
                setModified(node);
            }
        };

        setcore.delMemberAttribute = function (node, setName, memberPath, attrName) {
            ASSERT(typeof setName === 'string' && typeof attrName === 'string');
            harmonizeMemberData(node, setName);
            var memberRelId = getMemberRelId(node, setName, memberPath);
            if (memberRelId) {
                var memberNode = innerCore.getChild(
                    innerCore.getChild(innerCore.getChild(node, SETS_ID), setName), memberRelId);

                innerCore.delAttribute(memberNode, attrName);
                setModified(node);
            }
        };

        setcore.getMemberRegistryNames = function (node, setName, memberPath) {
            ASSERT(typeof setName === 'string');
            harmonizeMemberData(node, setName);
            var memberRelId = getMemberRelId(node, setName, memberPath);
            if (memberRelId) {
                var memberNode = innerCore.getChild(
                    innerCore.getChild(innerCore.getChild(node, SETS_ID), setName), memberRelId);

                return innerCore.getRegistryNames(memberNode);
            }
            return [];
        };
        setcore.getMemberOwnRegistryNames = function (node, setName, memberPath) {
            ASSERT(typeof setName === 'string');
            var memberRelId = getMemberRelId(node, setName, memberPath);
            if (memberRelId) {
                var memberNode = innerCore.getChild(
                    innerCore.getChild(innerCore.getChild(node, SETS_ID), setName), memberRelId);

                return innerCore.getOwnRegistryNames(memberNode);
            }
            return [];
        };
        setcore.getMemberRegistry = function (node, setName, memberPath, regName) {
            ASSERT(typeof setName === 'string' && typeof regName === 'string');
            harmonizeMemberData(node, setName);
            var memberRelId = getMemberRelId(node, setName, memberPath);
            if (memberRelId) {
                var memberNode = innerCore.getChild(
                    innerCore.getChild(innerCore.getChild(node, SETS_ID), setName), memberRelId);

                return innerCore.getRegistry(memberNode, regName);
            }
        };
        setcore.setMemberRegistry = function (node, setName, memberPath, regName, regValue) {
            ASSERT(typeof setName === 'string' && typeof regName === 'string' && regValue !== undefined);
            harmonizeMemberData(node, setName);
            var memberRelId = getMemberRelId(node, setName, memberPath);
            if (memberRelId) {
                var memberNode = innerCore.getChild(
                    innerCore.getChild(innerCore.getChild(node, SETS_ID), setName), memberRelId);

                innerCore.setRegistry(memberNode, regName, regValue);
                setModified(node);
            }
        };
        setcore.delMemberRegistry = function (node, setName, memberPath, regName) {
            ASSERT(typeof setName === 'string' && typeof regName === 'string');
            harmonizeMemberData(node, setName);
            var memberRelId = getMemberRelId(node, setName, memberPath);
            if (memberRelId) {
                var memberNode = innerCore.getChild(
                    innerCore.getChild(innerCore.getChild(node, SETS_ID), setName), memberRelId);

                innerCore.delRegistry(memberNode, regName);
                setModified(node);
            }
        };
        setcore.createSet = function (node, setName) {
            ASSERT(typeof setName === 'string');
            var setsNode = innerCore.getChild(node, SETS_ID),
                setNode = innerCore.getChild(setsNode, setName);

            //FIXME: hack, somehow the empty children have been removed during persist
            innerCore.setRegistry(setNode, '_', '_');

            innerCore.setPointer(innerCore.getChild(node, SETS_ID), setName, null);
            setModified(node);
        };
        setcore.deleteSet = function (node, setName) {
            ASSERT(typeof setName === 'string');
            var setsNode = innerCore.getChild(node, SETS_ID),
                setNode = innerCore.getChild(setsNode, setName);
            innerCore.deletePointer(setsNode, setName);
            innerCore.deleteNode(setNode, true);
            setModified(node);
        };

        setcore.isMemberOf = function (node) {
            //TODO we should find a proper way to do this - or at least some support from lower layers would be fine
            var coll = setcore.getCollectionPaths(node, REL_ID);
            var sets = {};
            for (var i = 0; i < coll.length; i++) {
                var pathArray = coll[i].split('/');
                if (pathArray.indexOf('_meta') === -1) {
                    //now we simply skip META sets...
                    var index = pathArray.indexOf(SETS_ID);
                    if (index > 0 && pathArray.length > index + 1) {
                        //otherwise it is not a real set
                        var ownerPath = pathArray.slice(0, index).join('/');
                        if (sets[ownerPath] === undefined) {
                            sets[ownerPath] = [];
                        }
                        sets[ownerPath].push(pathArray[index + 1]);
                    }
                }
            }
            return sets;
        };

        /*setcore.getDataForSingleHash = function(node){
         ASSERT(setcore.isValidNode(node));
         var datas = innerCore.getDataForSingleHash(node);

         //now we should stir all the sets hashes into the node's hash to get changes deep inside
         var names = setcore.getSetNames(node);
         for(var i=0;i<names.length;i++){
         var setNode = setcore.getChild(setcore.getChild(node,SETS_ID),names[i]);
         var memberRelids = setcore.getChildrenRelids(setNode);
         for(var j=0;j<memberRelids.length;j++){
         datas = datas.concat(innerCore.getDataForSingleHash(setcore.getChild(setNode,memberRelids[j])));
         }
         }

         return datas;
         };*/

        return setcore;

    }

    return SetCore;
});



/*globals define*/
/*jshint node: true, browser: true, bitwise: false*/

/**
 * @author kecso / https://github.com/kecso
 */

define('common/util/guid',[],function () {
    

    var guid = function () {
        var S4 = function () {
            return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
        };

        //return GUID
        return (S4() + S4() + '-' + S4() + '-' + S4() + '-' + S4() + '-' + S4() + S4() + S4());
    };

    return guid;
});
/*globals define*/
/*jshint node:true, browser: true*/
/**
 * @author pmeijer / https://github.com/pmeijer
 */

define('common/regexp',[], function () {
    
    var HASH = new RegExp('^#[0-9a-zA-Z_]*$'),
        BRANCH = new RegExp('^[0-9a-zA-Z_]*$'),
        RAW_BRANCH = new RegExp('^\\*[0-9a-zA-Z_]*$'),// This is how it's stored in mongodb, i.e. with a prefixed *.
        PROJECT = new RegExp('^(?!system\\.)(?!_)[0-9a-zA-Z_]*$'), // project name may not start with system. or _

        GUID = new RegExp('[a-z0-9]{8}(-[a-z0-9]{4}){3}-[a-z0-9]{12}', 'i');

    return {
        HASH: HASH,
        BRANCH: BRANCH,
        RAW_BRANCH: RAW_BRANCH,
        PROJECT: PROJECT,
        GUID: GUID
    };
});

/*globals define*/

/**
 * @author kecso / https://github.com/kecso
 */

define('common/core/guidcore',[
    'common/util/assert',
    'common/util/guid',
    'common/core/tasync',
    'common/regexp'
], function (ASSERT, GUID, TASYNC, REGEXP) {

    

    var OWN_GUID = '_relguid';

    function guidCore(_innerCore, options) {
        ASSERT(typeof options === 'object');
        ASSERT(typeof options.globConf === 'object');
        ASSERT(typeof options.logger !== 'undefined');
        var logger = options.logger.fork('guidCore');
        //helper functions
        function toInternalGuid(myGuid) {
            return myGuid.replace(/-/g, '');
        }

        function toExternalGuid(myGuid) {
            var out = myGuid.substr(0, 8) + '-' + myGuid.substr(8, 4) + '-' +
                myGuid.substr(12, 4) + '-' + myGuid.substr(16, 4) + '-' + myGuid.substr(20);
            return out;
        }

        function guidToArray(guid) {
            if (guid === null || guid === undefined) {
                return [0, 0, 0, 0, 0, 0, 0, 0];
            }
            var array = [];
            for (var i = 0; i < guid.length / 4; i++) {
                array.push(parseInt(guid.substr(4 * i, 4), 16));
            }
            return array;
        }

        function getRelidGuid(node) {
            //TODO we always should know what structure we should expect as a relid -
            // now we think it is a number so it can be converted to 0xsomething
            var relid = _core.getRelid(node);
            relid = Number(relid);
            if (relid === 'NaN') {
                return null;
            }
            if (relid < 0) {
                relid = relid * (-1);
            }

            relid = relid.toString(16);

            //now we should fill up with 0's in the beggining
            while (relid.length < 32) {
                relid = relid + '0'; //TODO we pad to the end so the final result will be more visible during debug
            }
            return relid;
        }

        function xorGuids(a, b) {
            var arrayA = guidToArray(a);
            var arrayB = guidToArray(b);

            ASSERT(arrayA.length === arrayB.length);

            var arrayOut = [];
            for (var i = 0; i < arrayA.length; i++) {
                /*jshint bitwise: false*/
                arrayOut.push(arrayA[i] ^ arrayB[i]);
            }
            for (i = 0; i < arrayOut.length; i++) {
                arrayOut[i] = Number(arrayOut[i]).toString(16);
                var difi = 4 - arrayOut[i].length;
                while (difi > 0) {
                    arrayOut[i] = '0' + arrayOut[i];
                    difi--;
                }
            }
            return arrayOut.join('');
        }

        var _core = {};
        for (var i in _innerCore) {
            _core[i] = _innerCore[i];
        }
        logger.debug('initialized');
        //new functions
        _core.getMiddleGuid = function (node) {
            var outGuid = _core.getAttribute(node, OWN_GUID);
            var tempnode = _core.getParent(node);
            while (tempnode) {
                outGuid = xorGuids(outGuid, _core.getAttribute(tempnode, OWN_GUID));
                tempnode = _core.getParent(tempnode);
            }
            return outGuid;
        };

        _core.getGuid = function (node) {
            var middle = _core.getMiddleGuid(node),
                relid = getRelidGuid(node),
                guid = xorGuids(middle, relid);
            return toExternalGuid(guid);
        };

        _core.setGuid = function (node, guid) {
            ASSERT(REGEXP.GUID.test(guid));
            var children = _core.loadChildren(node);
            return TASYNC.call(function (nodeArray) {
                var newGuid = toInternalGuid(guid);
                //first setting the node's OWN_GUID
                var oldOwn = _core.getAttribute(node, OWN_GUID);
                var parent = _core.getParent(node);
                if (parent) {
                    _core.setAttribute(node, OWN_GUID,
                        xorGuids(newGuid, xorGuids(_core.getMiddleGuid(parent), getRelidGuid(node))));
                } else {
                    _core.setAttribute(node, OWN_GUID, xorGuids(newGuid, getRelidGuid(node)));
                }
                var newOwn = _core.getAttribute(node, OWN_GUID);
                //now modify its children's
                for (var i = 0; i < nodeArray.length; i++) {
                    var oldGuid = _core.getAttribute(nodeArray[i], OWN_GUID);
                    _core.setAttribute(nodeArray[i], OWN_GUID, xorGuids(oldGuid, xorGuids(oldOwn, newOwn)));
                }

                return;
            }, children);
        };

        //modified functions
        _core.createNode = function (parameters) {
            parameters = parameters || {};
            var guid = parameters.guid || GUID(),
                parent = parameters.parent;

            ASSERT(REGEXP.GUID.test(guid));

            var node = _innerCore.createNode(parameters);
            guid = toInternalGuid(guid);

            var relguid = '';
            if (parent) {
                relguid = xorGuids(toInternalGuid(_core.getMiddleGuid(_core.getParent(node))),
                    xorGuids(guid, getRelidGuid(node)));
            } else {
                relguid = xorGuids(guid, getRelidGuid(node));
            }
            _innerCore.setAttribute(node, OWN_GUID, relguid);

            return node;
        };

        _core.moveNode = function (node, parent) {
            var oldGuid = toInternalGuid(_core.getGuid(node)),
                newNode = _innerCore.moveNode(node, parent);

            _core.setAttribute(newNode, OWN_GUID, xorGuids(_core.getMiddleGuid(parent),
                xorGuids(oldGuid, getRelidGuid(newNode))));

            return newNode;
        };

        _core.copyNode = function (node, parent) {
            var newNode = _innerCore.copyNode(node, parent);
            _core.setAttribute(newNode, OWN_GUID, toInternalGuid(GUID()));
            return newNode;
        };

        _core.copyNodes = function (nodes, parent) {
            var copiedNodes = _innerCore.copyNodes(nodes, parent),
                i;
            for (i = 0; i < copiedNodes.length; i++) {
                _core.setAttribute(copiedNodes[i], OWN_GUID, toInternalGuid(GUID()));
            }

            return copiedNodes;
        };

        return _core;
    }

    return guidCore;
});

/*globals define*/
/*jshint node: true, browser: true*/

/**
 * @author kecso / https://github.com/kecso
 */

define('common/core/nullpointercore',['common/util/assert'], function (ASSERT) {
    

    var NULLPTR_NAME = '_null_pointer';
    var NULLPTR_RELID = '_nullptr';


    function nullPointerCore(_innerCore, options) {
        ASSERT(typeof options === 'object');
        ASSERT(typeof options.globConf === 'object');
        ASSERT(typeof options.logger !== 'undefined');
        var _core = {},
            logger = options.logger.fork('nullpointercore');
        for (var i in _innerCore) {
            _core[i] = _innerCore[i];
        }
        logger.debug('initialized');

        //extra functions
        _core.setPointer = function (node, name, target) {
            if (target === null) {
                var nullChild = _innerCore.getChild(node, NULLPTR_RELID);
                _innerCore.setAttribute(nullChild, 'name', NULLPTR_NAME);
                _innerCore.setPointer(node, name, nullChild);
            } else {
                _innerCore.setPointer(node, name, target);
            }
        };

        _core.getPointerPath = function (node, name) {
            var path = _innerCore.getPointerPath(node, name);
            if (path && path.indexOf(NULLPTR_RELID) !== -1) {
                return null;
            } else {
                return path;
            }
        };

        _core.loadPointer = function (node, name) {
            var path = _core.getPointerPath(node, name);
            if (path === null) {
                return null;
            } else {
                return _innerCore.loadPointer(node, name);
            }
        };

        return _core;
    }

    return nullPointerCore;
});



/*globals define*/
/*jshint node: true, browser: true*/

/**
 * @author mmaroti / https://github.com/mmaroti
 */

define('common/core/coreunwrap',['common/util/assert', 'common/core/tasync'], function (ASSERT, TASYNC) {
    

    // ----------------- CoreUnwrap -----------------

    var CoreUnwrap = function (oldcore, options) {
        ASSERT(typeof options === 'object');
        ASSERT(typeof options.globConf === 'object');
        ASSERT(typeof options.logger !== 'undefined');
        var logger = options.logger.fork('coreunwrap');

        function checkNode(node) {
            if (node === null || oldcore.isValidNode(node)) {
                return node;
            } else {
                throw new Error('Invalid result node');
            }
        }

        function checkNodes(nodes) {
            ASSERT(nodes instanceof Array);

            var i;
            for (i = 0; i < nodes.length; ++i) {
                if (!oldcore.isValidNode(nodes[i])) {
                    throw new Error('Invalid result node array');
                }
            }

            return nodes;
        }

        // copy all operations
        var core = {};
        for (var key in oldcore) {
            core[key] = oldcore[key];
        }
        logger.debug('initialized');
        core.loadRoot = TASYNC.unwrap(oldcore.loadRoot);
        //core.persist = TASYNC.unwrap(oldcore.persist);

        // core.loadChild = TASYNC.unwrap(oldcore.loadChild);
        core.loadChild = TASYNC.unwrap(function (node, relid) {
            return TASYNC.call(checkNode, oldcore.loadChild(node, relid));
        });

        // core.loadByPath = TASYNC.unwrap(oldcore.loadByPath);
        core.loadByPath = TASYNC.unwrap(function (node, path) {
            return TASYNC.call(checkNode, oldcore.loadByPath(node, path));
        });

        // core.loadChildren = TASYNC.unwrap(oldcore.loadChildren);
        core.loadChildren = TASYNC.unwrap(function (node) {
            return TASYNC.call(checkNodes, oldcore.loadChildren(node));
        });

        core.loadPointer = TASYNC.unwrap(oldcore.loadPointer);
        core.loadCollection = TASYNC.unwrap(oldcore.loadCollection);

        core.loadSubTree = TASYNC.unwrap(oldcore.loadSubTree);
        core.loadTree = TASYNC.unwrap(oldcore.loadTree);

        //core diff async functions
        if (typeof oldcore.generateTreeDiff === 'function') {
            core.generateTreeDiff = TASYNC.unwrap(oldcore.generateTreeDiff);
        }

        if (typeof oldcore.generateLightTreeDiff === 'function') {
            core.generateLightTreeDiff = TASYNC.unwrap(oldcore.generateLightTreeDiff);
        }

        if (typeof oldcore.applyTreeDiff === 'function') {
            core.applyTreeDiff = TASYNC.unwrap(oldcore.applyTreeDiff);
        }

        return core;
    };

    return CoreUnwrap;
});

/*globals define*/
/*jshint node: true, browser: true*/

/**
 * @author mmaroti / https://github.com/mmaroti
 */

define('common/core/coretype',['common/util/assert', 'common/core/core', 'common/core/tasync'], function (ASSERT, Core, TASYNC) {
    

    // ----------------- CoreType -----------------

    //FIXME TODO these stuff have been simply copied from lower layer, probably it should be put to some constant place
    var OVERLAYS = 'ovr';
    var COLLSUFFIX = '-inv';

    var CoreType = function (oldcore, options) {
        // copy all operations
        ASSERT(typeof options === 'object');
        ASSERT(typeof options.globConf === 'object');
        ASSERT(typeof options.logger !== 'undefined');
        var core = {},
            logger = options.logger.fork('coretype');
        for (var key in oldcore) {
            core[key] = oldcore[key];
        }
        logger.debug('initialized');
        // ----- validity

        function __test(text, cond) {
            if (!cond) {
                throw new Error(text);
            }
        }

        function isValidNode(node) {
            try {
                __test('core', oldcore.isValidNode(node));
                __test('base', typeof node.base === 'object');
                return true;
            } catch (error) {
                logger.error(error.message, {stack: error.stack, node: node});
                return false;
            }
        }

        function isFalseNode(node) {
            //TODO this hack should be removed, but now it seems just fine :)
            if (typeof oldcore.getPointerPath(node, 'base') === 'undefined') {
                return true;
            }
            return false;
        }

        core.isValidNode = isValidNode;

        // ----- navigation

        core.getBase = function (node) {
            ASSERT(isValidNode(node));

            // TODO: check if base has moved
            return node.base;
        };

        core.getBaseRoot = function (node) {
            ASSERT(isValidNode(node));
            while (node.base !== null) {
                node = node.base;
            }

            return node;
        };

        core.loadRoot = function (hash) {
            return TASYNC.call(__loadRoot2, oldcore.loadRoot(hash));
        };

        function __loadRoot2(node) {
            ASSERT(typeof node.base === 'undefined' || node.base === null);
            //kecso - TODO it should be undefined, but maybe because of the cache it can be null

            node.base = null;
            return node;
        }

        core.loadChild = function (node, relid) {
            var child = null,
                base = core.getBase(node),
                basechild = null;
            if (base) {
                //the parent is inherited
                if (core.getChildrenRelids(base).indexOf(relid) !== -1) {
                    //inherited child
                    if (oldcore.getChildrenRelids(node).indexOf(relid) !== -1) {
                        //but it is overwritten so we should load it
                        child = oldcore.loadChild(node, relid);
                    }
                    basechild = core.loadChild(base, relid);
                    return TASYNC.call(function (b, c, n, r) {
                        if (c) {
                            child = c;
                            child.base = b;
                            return child;
                        } else {
                            child = oldcore.getChild(n, r);
                            core.setHashed(child, true, true);
                            child.base = b;

                            return child;
                        }
                    }, basechild, child, node, relid);
                }
            }
            //normal child
            return TASYNC.call(__loadBase, oldcore.loadChild(node, relid));
        };

        core.loadByPath = function (node, path) {
            ASSERT(isValidNode(node));
            ASSERT(path === '' || path.charAt(0) === '/');
            path = path.split('/');
            return loadDescendantByPath(node, path, 1);
        };
        var loadDescendantByPath = function (node, pathArray, index) {
            if (node === null || index === pathArray.length) {
                return node;
            }

            var child = core.loadChild(node, pathArray[index]);
            return TASYNC.call(loadDescendantByPath, child, pathArray, index + 1);
        };

        //TODO the pointer loading is totally based upon the loadByPath...
        core.loadPointer = function (node, name) {
            var pointerPath = core.getPointerPath(node, name);
            if (pointerPath === undefined) {
                return undefined;
            }
            if (pointerPath === null) {
                return null;
            }
            return TASYNC.call(core.loadByPath, core.getRoot(node), pointerPath);
        };

        function __loadBase(node) {
            ASSERT(node === null || typeof node.base === 'undefined' || typeof node.base === 'object');

            if (typeof node.base === 'undefined') {
                if (core.isEmpty(node)) {
                    //empty nodes do not have a base
                    node.base = null;
                    return node;
                } else if (isFalseNode(node)) {
                    var root = core.getRoot(node);
                    oldcore.deleteNode(node);
                    core.persist(root);
                    return null;
                } else {
                    var basepath = oldcore.getPointerPath(node, 'base');
                    ASSERT(basepath !== undefined);
                    if (basepath === null) {
                        node.base = null;
                        return node;
                    } else {
                        return TASYNC.call(__loadBase2, node, core.loadByPath(core.getRoot(node), basepath));
                    }
                }
            } else {
                //TODO can the base change at this point???
                return node;
            }
        }

        function __loadBase2(node, target) {
            if (typeof node.base !== null && typeof node.base === 'object' &&
                (oldcore.getPath(node.base) === oldcore.getPath(target))) {
                //TODO somehow the object already loaded properly and we do no know about it!!!
                return node;
            } else {
                ASSERT(typeof node.base === 'undefined' || node.base === null); //kecso

                if (target === null) {
                    node.base = null;
                    return node;
                } else {
                    return TASYNC.call(function (n, b) {
                        n.base = b;
                        return n;
                    }, node, __loadBase(target));
                }
            }
        }

        core.getChildrenRelids = function (node) {
            var inheritRelIds = node.base === null ? [] : core.getChildrenRelids(core.getBase(node));
            var ownRelIds = oldcore.getChildrenRelids(node);
            for (var i = 0; i < inheritRelIds.length; i++) {
                if (ownRelIds.indexOf(inheritRelIds[i]) === -1) {
                    ownRelIds.push(inheritRelIds[i]);
                }
            }
            return ownRelIds;
        };

        core.loadChildren = function (node) {
            ASSERT(isValidNode(node));
            var relids = core.getChildrenRelids(node);
            relids = relids.sort(); //TODO this should be temporary
            var children = [];
            for (var i = 0; i < relids.length; i++) {
                children[i] = core.loadChild(node, relids[i]);
            }
            return TASYNC.call(function (n) {
                var newn = [];
                for (var i = 0; i < n.length; i++) {
                    if (n[i] !== null) {
                        newn.push(n[i]);
                    }
                }
                return newn;
            }, TASYNC.lift(children));
        };

        //collection handling and needed functions
        function _isInheritedChild(node) {
            var parent = core.getParent(node),
                base = core.getBase(node),
                parentBase = parent ? core.getBase(parent) : null,
                baseParent = base ? core.getParent(base) : null;

            if (baseParent && parentBase && core.getPath(baseParent) === core.getPath(parentBase)) {
                return true;
            }
            return false;
        }

        function _getInstanceRoot(node) {

            while (_isInheritedChild(node)) {
                node = core.getParent(node);
            }

            return node;
        }

        //TODO copied function from corerel
        function isPointerName(name) {
            ASSERT(typeof name === 'string');

            return name.slice(-COLLSUFFIX.length) !== COLLSUFFIX;
        }

        function _getInheritedCollectionNames(node) {
            var target = '',
                names = [],
                coretree = core.getCoreTree(),
                startNode = node,
                endNode = _getInstanceRoot(node),
                exit;

            if (core.getPath(startNode) === core.getPath(endNode)) {
                return names;
            }

            do {
                startNode = core.getBase(startNode);
                endNode = core.getBase(endNode);
                node = startNode;
                exit = false;
                target = '';
                do {
                    if (core.getPath(node) === core.getPath(endNode)) {
                        exit = true;
                    }
                    var child = coretree.getProperty(coretree.getChild(node, OVERLAYS), target);
                    if (child) {
                        for (var name in child) {
                            if (!isPointerName(name)) {
                                name = name.slice(0, -COLLSUFFIX.length);
                                if (names.indexOf(name) < 0) {
                                    names.push(name);
                                }
                            }
                        }
                    }

                    target = '/' + coretree.getRelid(node) + target;
                    node = coretree.getParent(node);
                } while (!exit);
            } while (_isInheritedChild(startNode));

            return names;
        }

        function _getInheritedCollectionPaths(node, name) {
            var target = '',
                result = [],
                coretree = core.getCoreTree(),
                startNode = node,
                endNode = _getInstanceRoot(node),
                prefixStart = startNode,
                prefixNode = prefixStart,
                exit,
                collName = name + COLLSUFFIX,
                notOverwritten = function (sNode, eNode, source) {
                    var result = true,
                        tNode = sNode,
                        child, target;

                    while (core.getPath(tNode) !== core.getPath(eNode)) {
                        child = coretree.getChild(tNode, OVERLAYS);
                        child = coretree.getChild(child, source);
                        if (child) {
                            target = coretree.getProperty(child, name);
                            if (target) {
                                return false;
                            }
                        }
                        tNode = core.getBase(tNode);
                    }

                    return result;
                };

            if (core.getPath(startNode) === core.getPath(endNode)) {
                return result;
            }

            do {
                startNode = core.getBase(startNode);
                endNode = core.getBase(endNode);
                node = startNode;
                prefixNode = prefixStart;
                exit = false;
                target = '';
                do {
                    if (core.getPath(node) === core.getPath(endNode)) {
                        exit = true;
                    }
                    var child = coretree.getChild(node, OVERLAYS);
                    child = coretree.getChild(child, target);
                    if (child) {
                        var sources = coretree.getProperty(child, collName);
                        if (sources) {
                            ASSERT(Array.isArray(sources) && sources.length >= 1);

                            var prefix = coretree.getPath(prefixNode);

                            for (var i = 0; i < sources.length; ++i) {
                                if (notOverwritten(prefixNode, node, sources[i])) {
                                    result.push(coretree.joinPaths(prefix, sources[i]));
                                }
                            }
                        }
                    }

                    target = '/' + coretree.getRelid(node) + target;
                    node = coretree.getParent(node);
                    prefixNode = core.getParent(prefixNode);
                } while (!exit);
            } while (_isInheritedChild(startNode));

            return result;
        }

        core.getCollectionNames = function (node) {
            ASSERT(isValidNode(node));
            var checkCollNames = function (draft) {
                    var filtered = [],
                        i, sources;
                    for (i = 0; i < draft.length; i++) {
                        sources = core.getCollectionPaths(node, draft[i]);
                        if (sources.length > 0) {
                            filtered.push(draft[i]);
                        }
                    }
                    return filtered;
                },
                ownNames = oldcore.getCollectionNames(node),
                inhNames = checkCollNames(_getInheritedCollectionNames(node)),
                i;
            for (i = 0; i < ownNames.length; i++) {
                if (inhNames.indexOf(ownNames[i]) < 0) {
                    inhNames.push(ownNames[i]);
                }
            }

            return inhNames;
        };

        core.getCollectionPaths = function (node, name) {
            ASSERT(isValidNode(node) && name);
            var ownPaths = oldcore.getCollectionPaths(node, name),
                inhPaths = _getInheritedCollectionPaths(node, name);

            inhPaths = inhPaths.concat(ownPaths);

            return inhPaths;
        };

        core.loadCollection = function (node, name) {
            var root = core.getRoot(node);
            var paths = core.getCollectionPaths(node, name);

            var nodes = [];
            for (var i = 0; i < paths.length; i++) {
                nodes[i] = core.loadByPath(root, paths[i]);
            }

            return TASYNC.lift(nodes);
        };

        // ----- creation

        core.createNode = function (parameters) {
            parameters = parameters || {};
            var base = parameters.base || null,
                parent = parameters.parent;


            ASSERT(!parent || isValidNode(parent));
            ASSERT(!base || isValidNode(base));
            ASSERT(!base || core.getPath(base) !== core.getPath(parent));

            var node = oldcore.createNode(parameters);
            node.base = base;
            oldcore.setPointer(node, 'base', base);

            return node;
        };

        // ----- properties

        core.getAttributeNames = function (node) {
            ASSERT(isValidNode(node));

            var merged = {};
            do {
                var names = oldcore.getAttributeNames(node);
                for (var i = 0; i < names.length; ++i) {
                    if (!(names[i] in merged)) {
                        merged[names[i]] = true;
                    }
                }

                node = node.base;
            } while (node);

            return Object.keys(merged);
        };
        core.getOwnAttributeNames = function (node) {
            return oldcore.getAttributeNames(node);
        };

        core.getRegistryNames = function (node) {
            ASSERT(isValidNode(node));

            var merged = {};
            do {
                var names = oldcore.getRegistryNames(node);
                for (var i = 0; i < names.length; ++i) {
                    if (!(names[i] in merged)) {
                        merged[names[i]] = true;
                    }
                }

                node = node.base;
            } while (node);

            return Object.keys(merged);
        };
        core.getOwnRegistryNames = function (node) {
            return oldcore.getRegistryNames(node);
        };

        core.getAttribute = function (node, name) {
            ASSERT(isValidNode(node));
            var value;
            do {
                value = oldcore.getAttribute(node, name);
                node = node.base;
            } while (typeof value === 'undefined' && node !== null);

            return value;
        };
        core.getOwnAttribute = function (node, name) {
            return oldcore.getAttribute(node, name);
        };

        core.getRegistry = function (node, name) {
            ASSERT(isValidNode(node));
            var value;
            do {
                value = oldcore.getRegistry(node, name);
                node = node.base;
            } while (typeof value === 'undefined' && node !== null);

            return value;
        };
        core.getOwnRegistry = function (node, name) {
            return oldcore.getRegistry(node, name);
        };


        // ----- pointers

        core.getPointerNames = function (node) {
            ASSERT(isValidNode(node));

            var merged = {};
            do {
                var names = oldcore.getPointerNames(node);
                for (var i = 0; i < names.length; ++i) {
                    if (!(names[i] in merged)) {
                        merged[names[i]] = true;
                    }
                }

                node = node.base;
            } while (node);

            return Object.keys(merged);
        };
        core.getOwnPointerNames = function (node) {
            ASSERT(isValidNode(node));
            return oldcore.getPointerNames(node);
        };

        core.getPointerPath = function (node, name) {
            ASSERT(isValidNode(node) && typeof name === 'string');

            var ownPointerPath = oldcore.getPointerPath(node, name);
            if (ownPointerPath !== undefined) {
                return ownPointerPath;
            }
            var source = '',
                target,
                coretree = core.getCoreTree(),
                basePath,
                hasNullTarget = false,
                getProperty = function (node, name) {
                    var property;
                    while (property === undefined && node !== null) {
                        property = coretree.getProperty(node, name);
                        node = core.getBase(node);
                    }
                    return property;
                },
                getSimpleBasePath = function (node) {
                    var path = oldcore.getPointerPath(node, name);
                    if (path === undefined) {
                        if (node.base !== null && node.base !== undefined) {
                            return getSimpleBasePath(node.base);
                        } else {
                            return undefined;
                        }
                    } else {
                        return path;
                    }
                },
                getParentOfBasePath = function (node) {
                    if (node.base) {
                        var parent = core.getParent(node.base);
                        if (parent) {
                            return core.getPath(parent);
                        } else {
                            return undefined;
                        }
                    } else {
                        return undefined;
                    }
                },
                getBaseOfParentPath = function (node) {
                    var parent = core.getParent(node);
                    if (parent) {
                        if (parent.base) {
                            return core.getPath(parent.base);
                        } else {
                            return undefined;
                        }
                    } else {
                        return undefined;
                    }
                },
                getTargetRelPath = function (node, relSource, name) {
                    var ovr = core.getChild(node, 'ovr');
                    var source = core.getChild(ovr, relSource);
                    return getProperty(source, name);
                };

            basePath = node.base ? getSimpleBasePath(node.base) : undefined;

            while (node) {
                target = getTargetRelPath(node, source, name);
                if (target !== undefined) {
                    if (target.indexOf('_nullptr') !== -1) {
                        hasNullTarget = true;
                        target = undefined;
                    } else {
                        break;
                    }
                }

                source = '/' + core.getRelid(node) + source;
                if (getParentOfBasePath(node) === getBaseOfParentPath(node)) {
                    node = core.getParent(node);
                } else {
                    node = null;
                }
            }


            if (target !== undefined) {
                ASSERT(node);
                target = coretree.joinPaths(oldcore.getPath(node), target);
            }

            if (typeof target === 'string') {
                return target;
            }
            if (typeof basePath === 'string') {
                return basePath;
            }
            if (hasNullTarget === true) {
                return null;
            }
            return undefined;

        };
        core.getOwnPointerPath = function (node, name) {
            oldcore.getPointerPath(node, name);
        };

        core.setBase = function (node, base) {
            ASSERT(isValidNode(node) && (base === undefined || base === null || isValidNode(base)));
            ASSERT(!base || core.getPath(core.getParent(node)) !== core.getPath(base));
            ASSERT(!base || core.getPath(node) !== core.getPath(base));
            if (!!base) {
                //TODO maybe this is not the best way, needs to be double checked
                node.base = base;
                var parent = core.getParent(node),
                    parentBase, baseParent;
                if (parent) {
                    parentBase = core.getBase(parent);
                    baseParent = core.getParent(base);
                    if (core.getPath(parentBase) !== core.getPath(baseParent)) {
                        //we have to set an exact pointer only if it is not inherited child
                        oldcore.setPointer(node, 'base', base);
                    } else {
                        oldcore.deletePointer(node, 'base'); //we remove the pointer just in case
                    }
                } else {
                    //if for some reason the node doesn't have a parent it is surely not an inherited child
                    oldcore.setPointer(node, 'base', base);
                }
            } else {
                oldcore.setPointer(node, 'base', null);
                node.base = null;
            }
        };

        core.getChild = function (node, relid) {
            ASSERT(isValidNode(node) && (typeof node.base === 'undefined' || typeof node.base === 'object'));
            var child = oldcore.getChild(node, relid);
            if (node.base !== null && node.base !== undefined) {
                if (child.base === null || child.base === undefined) {
                    child.base = core.getChild(node.base, relid);
                }
            } else {
                child.base = null;
            }
            return child;
        };
        core.moveNode = function (node, parent) {
            //TODO we have to check if the move is really allowed!!!
            ASSERT(isValidNode(node) && isValidNode(parent));
            var base = node.base,
                parentBase = parent.base;
            ASSERT(!base || core.getPath(base) !== core.getPath(parent));
            ASSERT(!parentBase || core.getPath(parentBase) !== core.getPath(node));

            var moved = oldcore.moveNode(node, parent);
            moved.base = base;
            return moved;
        };
        core.copyNode = function (node, parent) {
            var base = node.base;
            ASSERT(!base || core.getPath(base) !== core.getPath(parent));

            var newnode = oldcore.copyNode(node, parent);
            newnode.base = base;
            oldcore.setPointer(newnode, 'base', base);
            return newnode;
        };
        function _inheritedPointerNames(node) {
            var allNames = core.getPointerNames(node),
                ownNames = core.getOwnPointerNames(node),
                names = [],
                i;

            for (i = 0; i < allNames.length; i++) {
                if (ownNames.indexOf(allNames[i]) === -1) {
                    names.push(allNames[i]);
                }
            }

            return names;
        }

        core.copyNodes = function (nodes, parent) {
            var copiedNodes,
                i, j, index, base,
                relations = [],
                names, pointer,
                paths = [];

            //here we also have to copy the inherited relations which points inside the copy area
            for (i = 0; i < nodes.length; i++) {
                paths.push(core.getPath(nodes[i]));
            }

            for (i = 0; i < nodes.length; i++) {
                names = _inheritedPointerNames(nodes[i]);
                pointer = {};
                for (j = 0; j < names.length; j++) {
                    index = paths.indexOf(core.getPointerPath(nodes[i], names[j]));
                    if (index !== -1) {
                        pointer[names[j]] = index;
                    }
                }
                relations.push(pointer);
            }

            //making the actual copy
            copiedNodes = oldcore.copyNodes(nodes, parent);

            //setting internal-inherited relations
            for (i = 0; i < nodes.length; i++) {
                names = Object.keys(relations[i]);
                for (j = 0; j < names.length; j++) {
                    core.setPointer(copiedNodes[i], names[j], copiedNodes[relations[i][names[j]]]);
                }
            }

            //setting base relation
            for (i = 0; i < nodes.length; i++) {
                base = nodes[i].base;
                copiedNodes[i].base = base;
                oldcore.setPointer(copiedNodes[i], 'base', base);
            }


            return copiedNodes;
        };

        core.getChildrenPaths = function (node) {
            var path = core.getPath(node);

            var relids = core.getChildrenRelids(node);
            for (var i = 0; i < relids.length; ++i) {
                relids[i] = path + '/' + relids[i];
            }

            return relids;
        };

        core.deleteNode = function (node, technical) {
            //currently we only check if the node is inherited from its parents children
            if (node && (node.base !== null || technical === true)) {
                var parent = core.getParent(node),
                    parentsBase = parent ? core.getBase(node) : null,
                    base = core.getBase(node),
                    basesParent = base ? core.getParent(node) : null;

                if (parent && parentsBase && base && basesParent) {
                    if (core.getPath(parentsBase) !== core.getPath(basesParent)) {
                        oldcore.deleteNode(node);
                    }
                } else {
                    oldcore.deleteNode(node);
                }
            }
        };

        core.getTypeRoot = function (node) {
            if (node.base) {
                while (node.base !== null) {
                    node = core.getBase(node);
                }
                return node;
            } else {
                return null;
            }
        };

        // -------- kecso

        return core;
    };

    return CoreType;
});

/*globals define*/
/*jshint node: true, browser: true*/

/**
 * @author kecso / https://github.com/kecso
 *
 * example constraint structure for the outside world:
 * {
 *  script:string,
 *  priority:integer,
 *  name:string,
 *  message:string
 * }
 * provided API:
 * getConstraint(node,name) -> constraintObj
 * setConstraint(node,constraintObj)
 * getConstraintNames(node)
 * delConstraint(node,name)
 */

define('common/core/constraintcore',['common/util/assert'], function (ASSERT) {
    
    var CONSTRAINTS_RELID = '_constraints';
    var C_DEF_PRIORITY = 1;

    function constraintCore(_innerCore, options) {
        ASSERT(typeof options === 'object');
        ASSERT(typeof options.globConf === 'object');
        ASSERT(typeof options.logger !== 'undefined');
        var _core = {},
            logger = options.logger.fork('constraintcore');
        for (var i in _innerCore) {
            _core[i] = _innerCore[i];
        }
        logger.debug('initialized');
        var createNewConstraintRelId = function (constraintsNode) {
            var max = Math.pow(2, 31);
            var existingRelIds = _innerCore.getChildrenRelids(constraintsNode);
            var relId;
            do {
                relId = Math.floor(Math.random() * max);
            } while (existingRelIds.indexOf(relId) !== -1);
            return '' + relId;
        };

        var getConstraintRelId = function (constraintsNode, name) {
            var relIds = _innerCore.getChildrenRelids(constraintsNode);
            var relId;
            for (var i = 0; i < relIds.length; i++) {
                if (name === _innerCore.getAttribute(_innerCore.getChild(constraintsNode, relIds[i]), 'name')) {
                    relId = relIds[i];
                    break;
                }
            }
            return relId;
        };
        var getRegConstName = function (name) {
            return '_ch#_' + name;
        };

        _core.getConstraint = function (node, name) {
            ASSERT(_innerCore.isValidNode(node));
            var constraintsNode = _innerCore.getChild(node, CONSTRAINTS_RELID);
            var constRelId = getConstraintRelId(constraintsNode, name);
            if (constRelId) {
                var constraintNode = _innerCore.getChild(constraintsNode, constRelId);
                return {
                    script: _innerCore.getAttribute(constraintNode, 'script'),
                    priority: _innerCore.getAttribute(constraintNode, 'priority'),
                    info: _innerCore.getAttribute(constraintNode, 'info')
                };
            } else {
                return null;
            }
        };

        _core.setConstraint = function (node, name, constraintObj) {
            ASSERT(_innerCore.isValidNode(node));
            ASSERT(typeof constraintObj === 'object' && typeof name === 'string');
            var constraintsNode = _innerCore.getChild(node, CONSTRAINTS_RELID);
            var constRelId = getConstraintRelId(constraintsNode, name);
            if (!constRelId) {
                //we should create a new one
                constRelId = createNewConstraintRelId(constraintsNode);
            }

            var constraintNode = _innerCore.getChild(constraintsNode, constRelId);
            constraintObj.priority = constraintObj.priority || C_DEF_PRIORITY;
            constraintObj.script = constraintObj.script || 'console.log("empty constraint");';
            constraintObj.info = constraintObj.info || '';
            _innerCore.setAttribute(constraintNode, 'name', name);
            _innerCore.setAttribute(constraintNode, 'script', constraintObj.script);
            _innerCore.setAttribute(constraintNode, 'priority', constraintObj.priority);
            _innerCore.setAttribute(constraintNode, 'info', constraintObj.info);
            _innerCore.setRegistry(node, getRegConstName(name),
                (_innerCore.getRegistry(node, getRegConstName(name)) || 0) + 1);
        };

        _core.delConstraint = function (node, name) {
            ASSERT(_innerCore.isValidNode(node));
            var constraintsNode = _innerCore.getChild(node, CONSTRAINTS_RELID);
            var constRelId = getConstraintRelId(constraintsNode, name);
            if (constRelId) {
                var constraintNode = _innerCore.getChild(constraintsNode, constRelId);
                _innerCore.deleteNode(constraintNode, true);
            }
            _innerCore.delRegistry(node, getRegConstName(name));
        };

        _core.getConstraintNames = function (node) {
            ASSERT(_innerCore.isValidNode(node));
            var constraintsNode = _innerCore.getChild(node, CONSTRAINTS_RELID);
            var relIds = _innerCore.getChildrenRelids(constraintsNode);
            var names = [];
            for (var i = 0; i < relIds.length; i++) {
                names.push(_innerCore.getAttribute(_innerCore.getChild(constraintsNode, relIds[i]), 'name'));
            }
            return names;
        };

        //TODO this means we always have to have this layer above type/inheritance layer
        _core.getOwnConstraintNames = function (node) {
            ASSERT(_innerCore.isValidNode(node));
            var names = _core.getConstraintNames(node),
                base = _core.getBase(node),
                baseNames = [],
                i, index;

            if (base) {
                baseNames = _core.getConstraintNames(base);
            }

            for (i = 0; i < baseNames.length; i++) {
                index = names.indexOf(baseNames[i]);
                if (index !== -1) {
                    names.splice(index, 1);
                }
            }

            return names;
        };

        return _core;
    }

    return constraintCore;
});

//jshint ignore: start
/* jshint proto: true */

/**
 * jjv.js -- A javascript library to validate json input through a json-schema.
 *
 * Copyright (c) 2013 Alex Cornejo.
 *
 * Redistributable under a MIT-style open source license.
 */

(function () {
  var clone = function (obj) {
      // Handle the 3 simple types (string, number, function), and null or undefined
      if (obj === null || typeof obj !== 'object') return obj;
      var copy;

      // Handle Date
      if (obj instanceof Date) {
          copy = new Date();
          copy.setTime(obj.getTime());
          return copy;
      }

      // handle RegExp
      if (obj instanceof RegExp) {
        copy = new RegExp(obj);
        return copy;
      }

      // Handle Array
      if (obj instanceof Array) {
          copy = [];
          for (var i = 0, len = obj.length; i < len; i++)
              copy[i] = clone(obj[i]);
          return copy;
      }

      // Handle Object
      if (obj instanceof Object) {
          copy = {};
//           copy = Object.create(Object.getPrototypeOf(obj));
          for (var attr in obj) {
              if (obj.hasOwnProperty(attr))
                copy[attr] = clone(obj[attr]);
          }
          return copy;
      }

      throw new Error("Unable to clone object!");
  };

  var clone_stack = function (stack) {
    var stack_last = stack.length-1, key = stack[stack_last].key;
    var new_stack = stack.slice(0);
    new_stack[stack_last].object[key] = clone(new_stack[stack_last].object[key]);
    return new_stack;
  };

  var copy_stack = function (new_stack, old_stack) {
    var stack_last = new_stack.length-1, key = new_stack[stack_last].key;
    old_stack[stack_last].object[key] = new_stack[stack_last].object[key];
  };

  var handled = {
    'type': true,
    'not': true,
    'anyOf': true,
    'allOf': true,
    'oneOf': true,
    '$ref': true,
    '$schema': true,
    'id': true,
    'exclusiveMaximum': true,
    'exclusiveMininum': true,
    'properties': true,
    'patternProperties': true,
    'additionalProperties': true,
    'items': true,
    'additionalItems': true,
    'required': true,
    'default': true,
    'title': true,
    'description': true,
    'definitions': true,
    'dependencies': true
  };

  var fieldType = {
    'null': function (x) {
      return x === null;
    },
    'string': function (x) {
      return typeof x === 'string';
    },
    'boolean': function (x) {
      return typeof x === 'boolean';
    },
    'number': function (x) {
      return typeof x === 'number' && !isNaN(x);
    },
    'integer': function (x) {
      return typeof x === 'number' && x%1 === 0;
    },
    'object': function (x) {
      return x && typeof x === 'object' && !Array.isArray(x);
    },
    'array': function (x) {
      return Array.isArray(x);
    },
    'date': function (x) {
      return x instanceof Date;
    }
  };

  // missing: uri, date-time, ipv4, ipv6
  var fieldFormat = {
    'alpha': function (v) {
      return (/^[a-zA-Z]+$/).test(v);
    },
    'alphanumeric': function (v) {
      return (/^[a-zA-Z0-9]+$/).test(v);
    },
    'identifier': function (v) {
      return (/^[-_a-zA-Z0-9]+$/).test(v);
    },
    'hexadecimal': function (v) {
      return (/^[a-fA-F0-9]+$/).test(v);
    },
    'numeric': function (v) {
      return (/^[0-9]+$/).test(v);
    },
    'date-time': function (v) {
      return !isNaN(Date.parse(v)) && v.indexOf('/') === -1;
    },
    'uppercase': function (v) {
      return v === v.toUpperCase();
    },
    'lowercase': function (v) {
      return v === v.toLowerCase();
    },
    'hostname': function (v) {
      return v.length < 256 && (/^([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])(\.([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]{0,61}[a-zA-Z0-9]))*$/).test(v);
    },
    'uri': function (v) {
      return (/[-a-zA-Z0-9@:%_\+.~#?&//=]{2,256}\.[a-z]{2,4}\b(\/[-a-zA-Z0-9@:%_\+.~#?&//=]*)?/).test(v);
    },
    'email': function (v) { // email, ipv4 and ipv6 adapted from node-validator
      return (/^(?:[\w\!\#\$\%\&\'\*\+\-\/\=\?\^\`\{\|\}\~]+\.)*[\w\!\#\$\%\&\'\*\+\-\/\=\?\^\`\{\|\}\~]+@(?:(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-](?!\.)){0,61}[a-zA-Z0-9]?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9\-](?!$)){0,61}[a-zA-Z0-9]?)|(?:\[(?:(?:[01]?\d{1,2}|2[0-4]\d|25[0-5])\.){3}(?:[01]?\d{1,2}|2[0-4]\d|25[0-5])\]))$/).test(v);
    },
    'ipv4': function (v) {
      if ((/^(\d?\d?\d)\.(\d?\d?\d)\.(\d?\d?\d)\.(\d?\d?\d)$/).test(v)) {
        var parts = v.split('.').sort();
        if (parts[3] <= 255)
          return true;
      }
      return false;
    },
    'ipv6': function(v) {
      return (/^((?=.*::)(?!.*::.+::)(::)?([\dA-F]{1,4}:(:|\b)|){5}|([\dA-F]{1,4}:){6})((([\dA-F]{1,4}((?!\3)::|:\b|$))|(?!\2\3)){2}|(((2[0-4]|1\d|[1-9])?\d|25[0-5])\.?\b){4})$/).test(v);
     /*  return (/^::|^::1|^([a-fA-F0-9]{1,4}::?){1,7}([a-fA-F0-9]{1,4})$/).test(v); */
    }
  };

  var fieldValidate = {
    'readOnly': function (v, p) {
      return false;
    },
    // ****** numeric validation ********
    'minimum': function (v, p, schema) {
      return !(v < p || schema.exclusiveMinimum && v <= p);
    },
    'maximum': function (v, p, schema) {
      return !(v > p || schema.exclusiveMaximum && v >= p);
    },
    'multipleOf': function (v, p) {
      return (v/p)%1 === 0 || typeof v !== 'number';
    },
    // ****** string validation ******
    'pattern': function (v, p) {
      if (typeof v !== 'string')
        return true;
      var pattern, modifiers;
      if (typeof p === 'string')
        pattern=p;
      else {
        pattern=p[0];
        modifiers=p[1];
      }
      var regex = new RegExp(pattern, modifiers);
      return regex.test(v);
    },
    'minLength': function (v, p) {
      return v.length >= p || typeof v !== 'string';
    },
    'maxLength': function (v, p) {
      return v.length <= p || typeof v !== 'string';
    },
    // ***** array validation *****
    'minItems': function (v, p) {
      return v.length >= p || !Array.isArray(v);
    },
    'maxItems': function (v, p) {
      return v.length <= p || !Array.isArray(v);
    },
    'uniqueItems': function (v, p) {
      var hash = {}, key;
      for (var i = 0, len = v.length; i < len; i++) {
        key = JSON.stringify(v[i]);
        if (hash.hasOwnProperty(key))
          return false;
        else
          hash[key] = true;
      }
      return true;
    },
    // ***** object validation ****
    'minProperties': function (v, p) {
      if (typeof v !== 'object')
        return true;
      var count = 0;
      for (var attr in v) if (v.hasOwnProperty(attr)) count = count + 1;
      return count >= p;
    },
    'maxProperties': function (v, p) {
      if (typeof v !== 'object')
        return true;
      var count = 0;
      for (var attr in v) if (v.hasOwnProperty(attr)) count = count + 1;
      return count <= p;
    },
    // ****** all *****
    'enum': function (v, p) {
      var i, len, vs;
      if (typeof v === 'object') {
        vs = JSON.stringify(v);
        for (i = 0, len = p.length; i < len; i++)
          if (vs === JSON.stringify(p[i]))
            return true;
      } else {
        for (i = 0, len = p.length; i < len; i++)
          if (v === p[i])
            return true;
      }
      return false;
    }
  };

  var normalizeID = function (id) {
    return id.indexOf("://") === -1 ? id : id.split("#")[0];
  };

  var resolveURI = function (env, schema_stack, uri) {
    var curschema, components, hash_idx, name;

    hash_idx = uri.indexOf('#');

    if (hash_idx === -1) {
      if (!env.schema.hasOwnProperty(uri))
        return null;
      return [env.schema[uri]];
    }

    if (hash_idx > 0) {
      name = uri.substr(0, hash_idx);
      uri = uri.substr(hash_idx+1);
      if (!env.schema.hasOwnProperty(name)) {
        if (schema_stack && schema_stack[0].id === name)
          schema_stack = [schema_stack[0]];
        else
          return null;
      } else
        schema_stack = [env.schema[name]];
    } else {
      if (!schema_stack)
        return null;
      uri = uri.substr(1);
    }

    if (uri === '')
      return [schema_stack[0]];

    if (uri.charAt(0) === '/') {
      uri = uri.substr(1);
      curschema = schema_stack[0];
      components = uri.split('/');
      while (components.length > 0) {
        if (!curschema.hasOwnProperty(components[0]))
          return null;
        curschema = curschema[components[0]];
        schema_stack.push(curschema);
        components.shift();
      }
      return schema_stack;
    } else // FIX: should look for subschemas whose id matches uri
      return null;
  };

  var resolveObjectRef = function (object_stack, uri) {
    var components, object, last_frame = object_stack.length-1, skip_frames, frame, m = /^(\d+)/.exec(uri);

    if (m) {
      uri = uri.substr(m[0].length);
      skip_frames = parseInt(m[1], 10);
      if (skip_frames < 0 || skip_frames > last_frame)
        return;
      frame = object_stack[last_frame-skip_frames];
      if (uri === '#')
        return frame.key;
    } else
      frame = object_stack[0];

    object = frame.object[frame.key];

    if (uri === '')
      return object;

    if (uri.charAt(0) === '/') {
      uri = uri.substr(1);
      components = uri.split('/');
      while (components.length > 0) {
        components[0] = components[0].replace(/~1/g, '/').replace(/~0/g, '~');
        if (!object.hasOwnProperty(components[0]))
          return;
        object = object[components[0]];
        components.shift();
      }
      return object;
    } else
      return;
  };

  var checkValidity = function (env, schema_stack, object_stack, options) {
    var i, len, count, hasProp, hasPattern;
    var p, v, malformed = false, objerrs = {}, objerr, objreq, errors = {}, props, matched, isArray;
    var sl = schema_stack.length-1, schema = schema_stack[sl];
    var ol = object_stack.length-1, object = object_stack[ol].object, name = object_stack[ol].key, prop = object[name];

    if (schema.hasOwnProperty('$ref')) {
      schema_stack= resolveURI(env, schema_stack, schema.$ref);
      if (!schema_stack)
        return {'$ref': schema.$ref};
      else
        return checkValidity(env, schema_stack, object_stack, options);
    }

    if (schema.hasOwnProperty('type')) {
      if (typeof schema.type === 'string') {
        if (options.useCoerce && env.coerceType.hasOwnProperty(schema.type))
          prop = object[name] = env.coerceType[schema.type](prop);
        if (!env.fieldType[schema.type](prop))
          return {'type': schema.type};
      } else {
        malformed = true;
        for (i = 0, len = schema.type.length; i < len && malformed; i++)
          if (env.fieldType[schema.type[i]](prop))
            malformed = false;
        if (malformed)
          return {'type': schema.type};
      }
    }

    if (schema.hasOwnProperty('allOf')) {
      for (i = 0, len = schema.allOf.length; i < len; i++) {
        objerr = checkValidity(env, schema_stack.concat(schema.allOf[i]), object_stack, options);
        if (objerr)
          return objerr;
      }
    }

    if (!options.useCoerce && !options.useDefault && !options.removeAdditional) {
      if (schema.hasOwnProperty('oneOf')) {
        for (i = 0, len = schema.oneOf.length, count = 0; i < len; i++) {
          objerr = checkValidity(env, schema_stack.concat(schema.oneOf[i]), object_stack, options);
          if (!objerr) {
            count = count + 1;
            if (count > 1)
              break;
          } else {
            objerrs = objerr;
          }
        }
        if (count > 1)
          return {'oneOf': true};
        else if (count < 1)
          return objerrs;
        objerrs = {};
      }

      if (schema.hasOwnProperty('anyOf')) {
        for (i = 0, len = schema.anyOf.length; i < len; i++) {
          objerr = checkValidity(env, schema_stack.concat(schema.anyOf[i]), object_stack, options);
          if (!objerr)
            break;
        }
        if (objerr)
          return objerr;
      }

      if (schema.hasOwnProperty('not')) {
        objerr = checkValidity(env, schema_stack.concat(schema.not), object_stack, options);
        if (!objerr)
          return {'not': true};
      }
    } else {
      if (schema.hasOwnProperty('oneOf')) {
        for (i = 0, len = schema.oneOf.length, count = 0; i < len; i++) {
          new_stack = clone_stack(object_stack);
          objerr = checkValidity(env, schema_stack.concat(schema.oneOf[i]), new_stack, options);
          if (!objerr) {
            count = count + 1;
            if (count > 1)
              break;
            else
              copy_stack(new_stack, object_stack);
          } else {
            objerrs = objerr;
          }
        }
        if (count > 1)
          return {'oneOf': true};
        else if (count < 1)
          return objerrs;
        objerrs = {};
      }

      if (schema.hasOwnProperty('anyOf')) {
        for (i = 0, len = schema.anyOf.length; i < len; i++) {
          new_stack = clone_stack(object_stack);
          objerr = checkValidity(env, schema_stack.concat(schema.anyOf[i]), new_stack, options);
          if (!objerr) {
            copy_stack(new_stack, object_stack);
            break;
          }
        }
        if (objerr)
          return objerr;
      }

      if (schema.hasOwnProperty('not')) {
        objerr = checkValidity(env, schema_stack.concat(schema.not), clone_stack(object_stack), options);
        if (!objerr)
          return {'not': true};
      }
    }

    if (schema.hasOwnProperty('dependencies')) {
      for (p in schema.dependencies)
        if (schema.dependencies.hasOwnProperty(p) && prop.hasOwnProperty(p)) {
          if (Array.isArray(schema.dependencies[p])) {
            for (i = 0, len = schema.dependencies[p].length; i < len; i++)
              if (!prop.hasOwnProperty(schema.dependencies[p][i])) {
                return {'dependencies': true};
              }
          } else {
            objerr = checkValidity(env, schema_stack.concat(schema.dependencies[p]), object_stack, options);
            if (objerr)
              return objerr;
          }
        }
    }

    if (!Array.isArray(prop)) {
      props = [];
      objerrs = {};
      for (p in prop)
        if (prop.hasOwnProperty(p))
          props.push(p);

      if (options.checkRequired && schema.required) {
        for (i = 0, len = schema.required.length; i < len; i++)
          if (!prop.hasOwnProperty(schema.required[i])) {
            objerrs[schema.required[i]] = {'required': true};
            malformed = true;
          }
      }

      hasProp = schema.hasOwnProperty('properties');
      hasPattern = schema.hasOwnProperty('patternProperties');
      if (hasProp || hasPattern) {
        i = props.length;
        while (i--) {
          matched = false;
          if (hasProp && schema.properties.hasOwnProperty(props[i])) {
            matched = true;
            objerr = checkValidity(env, schema_stack.concat(schema.properties[props[i]]), object_stack.concat({object: prop, key: props[i]}), options);
            if (objerr !== null) {
              objerrs[props[i]] = objerr;
              malformed = true;
            }
          }
          if (hasPattern) {
            for (p in schema.patternProperties)
              if (schema.patternProperties.hasOwnProperty(p) && props[i].match(p)) {
                matched = true;
                objerr = checkValidity(env, schema_stack.concat(schema.patternProperties[p]), object_stack.concat({object: prop, key: props[i]}), options);
                if (objerr !== null) {
                  objerrs[props[i]] = objerr;
                  malformed = true;
                }
              }
          }
          if (matched)
            props.splice(i, 1);
        }
      }

      if (options.useDefault && hasProp && !malformed) {
        for (p in schema.properties)
          if (schema.properties.hasOwnProperty(p) && !prop.hasOwnProperty(p) && schema.properties[p].hasOwnProperty('default'))
            prop[p] = schema.properties[p]['default'];
      }

      if (options.removeAdditional && hasProp && schema.additionalProperties !== true && typeof schema.additionalProperties !== 'object') {
        for (i = 0, len = props.length; i < len; i++)
          delete prop[props[i]];
      } else {
        if (schema.hasOwnProperty('additionalProperties')) {
          if (typeof schema.additionalProperties === 'boolean') {
            if (!schema.additionalProperties) {
              for (i = 0, len = props.length; i < len; i++) {
                objerrs[props[i]] = {'additional': true};
                malformed = true;
              }
            }
          } else {
            for (i = 0, len = props.length; i < len; i++) {
              objerr = checkValidity(env, schema_stack.concat(schema.additionalProperties), object_stack.concat({object: prop, key: props[i]}), options);
              if (objerr !== null) {
                objerrs[props[i]] = objerr;
                malformed = true;
              }
            }
          }
        }
      }
      if (malformed)
        return {'schema': objerrs};
    } else {
      if (schema.hasOwnProperty('items')) {
        if (Array.isArray(schema.items)) {
          for (i = 0, len = schema.items.length; i < len; i++) {
            objerr = checkValidity(env, schema_stack.concat(schema.items[i]), object_stack.concat({object: prop, key: i}), options);
            if (objerr !== null) {
              objerrs[i] = objerr;
              malformed = true;
            }
          }
          if (prop.length > len && schema.hasOwnProperty('additionalItems')) {
            if (typeof schema.additionalItems === 'boolean') {
              if (!schema.additionalItems)
                return {'additionalItems': true};
            } else {
              for (i = len, len = prop.length; i < len; i++) {
                objerr = checkValidity(env, schema_stack.concat(schema.additionalItems), object_stack.concat({object: prop, key: i}), options);
                if (objerr !== null) {
                  objerrs[i] = objerr;
                  malformed = true;
                }
              }
            }
          }
        } else {
          for (i = 0, len = prop.length; i < len; i++) {
            objerr = checkValidity(env, schema_stack.concat(schema.items), object_stack.concat({object: prop, key: i}), options);
            if (objerr !== null) {
              objerrs[i] = objerr;
              malformed = true;
            }
          }
        }
      } else if (schema.hasOwnProperty('additionalItems')) {
        if (typeof schema.additionalItems !== 'boolean') {
          for (i = 0, len = prop.length; i < len; i++) {
            objerr = checkValidity(env, schema_stack.concat(schema.additionalItems), object_stack.concat({object: prop, key: i}), options);
            if (objerr !== null) {
              objerrs[i] = objerr;
              malformed = true;
            }
          }
        }
      }
      if (malformed)
        return {'schema': objerrs};
    }

    for (v in schema) {
      if (schema.hasOwnProperty(v) && !handled.hasOwnProperty(v)) {
        if (v === 'format') {
          if (env.fieldFormat.hasOwnProperty(schema[v]) && !env.fieldFormat[schema[v]](prop, schema, object_stack, options)) {
            objerrs[v] = true;
            malformed = true;
          }
        } else {
          if (env.fieldValidate.hasOwnProperty(v) && !env.fieldValidate[v](prop, schema[v].hasOwnProperty('$data') ? resolveObjectRef(object_stack, schema[v].$data) : schema[v], schema, object_stack, options)) {
            objerrs[v] = true;
            malformed = true;
          }
        }
      }
    }

    if (malformed)
      return objerrs;
    else
      return null;
  };

  var defaultOptions = {
    useDefault: false,
    useCoerce: false,
    checkRequired: true,
    removeAdditional: false
  };

  function Environment() {
    if (!(this instanceof Environment))
      return new Environment();

    this.coerceType = {};
    this.fieldType = clone(fieldType);
    this.fieldValidate = clone(fieldValidate);
    this.fieldFormat = clone(fieldFormat);
    this.defaultOptions = clone(defaultOptions);
    this.schema = {};
  }

  Environment.prototype = {
    validate: function (name, object, options) {
      var schema_stack = [name], errors = null, object_stack = [{object: {'__root__': object}, key: '__root__'}];

      if (typeof name === 'string') {
        schema_stack = resolveURI(this, null, name);
        if (!schema_stack)
          throw new Error('jjv: could not find schema \'' + name + '\'.');
      }

      if (!options) {
        options = this.defaultOptions;
      } else {
        for (var p in this.defaultOptions)
          if (this.defaultOptions.hasOwnProperty(p) && !options.hasOwnProperty(p))
            options[p] = this.defaultOptions[p];
      }

      errors = checkValidity(this, schema_stack, object_stack, options);

      if (errors)
        return {validation: errors.hasOwnProperty('schema') ? errors.schema : errors};
      else
        return null;
    },

    resolveRef: function (schema_stack, $ref) {
      return resolveURI(this, schema_stack, $ref);
    },

    addType: function (name, func) {
      this.fieldType[name] = func;
    },

    addTypeCoercion: function (type, func) {
      this.coerceType[type] = func;
    },

    addCheck: function (name, func) {
      this.fieldValidate[name] = func;
    },

    addFormat: function (name, func) {
      this.fieldFormat[name] = func;
    },

    addSchema: function (name, schema) {
      if (!schema && name) {
        schema = name;
        name = undefined;
      }
      if (schema.hasOwnProperty('id') && typeof schema.id === 'string' && schema.id !== name) {
        if (schema.id.charAt(0) === '/')
          throw new Error('jjv: schema id\'s starting with / are invalid.');
        this.schema[normalizeID(schema.id)] = schema;
      } else if (!name) {
        throw new Error('jjv: schema needs either a name or id attribute.');
      }
      if (name)
        this.schema[normalizeID(name)] = schema;
    }
  };

  // Export for use in server and client.
  if (typeof module !== 'undefined' && typeof module.exports !== 'undefined')
    module.exports = Environment;
  else if (typeof define === 'function' && define.amd)
    define('common/util/jjv',[],function () {return Environment;});
  else
    window.jjv = Environment;
})();

/*globals define*/
/*jshint node: true, browser: true*/

/**
 * @author mmaroti / https://github.com/mmaroti
 */

define('common/core/metacore',[
    'common/util/assert',
    'common/core/core',
    'common/core/tasync',
    'common/util/jjv',
    'common/util/canon'
], function (ASSERT, Core, TASYNC, JsonValidator, CANON) {
    

    // ----------------- CoreType -----------------

    var MetaCore = function (oldcore, options) {
        ASSERT(typeof options === 'object');
        ASSERT(typeof options.globConf === 'object');
        ASSERT(typeof options.logger !== 'undefined');
        // copy all operations
        var core = {},
            logger = options.logger.fork('metacore');
        for (var key in oldcore) {
            core[key] = oldcore[key];
        }
        logger.debug('initialized');
        var sameNode = function (nodeA, nodeB) {
            if (core.getPath(nodeA) === core.getPath(nodeB)) {
                return true;
            }
            return false;
        };

        var realNode = function (node) { //TODO we have to make some more sophisticated distinction
            if (core.getPath(node).indexOf('_') !== -1) {
                return false;
            }
            return true;
        };

        var getMetaNode = function (node) {
            return core.getChild(node, '_meta');
        };
        var getMetaChildrenNode = function (node) {
            return core.getChild(getMetaNode(node), 'children');
        };
        var getMetaPointerNode = function (node, name) {
            var meta = getMetaNode(node),
                pointerNames = core.getPointerNames(meta) || [];
            if (pointerNames.indexOf(name) !== -1) {
                return core.getChild(meta, '_p_' + name);
            }
            return null;
        };
        var _MetaPointerNode = function (node, name) {
            //this function always gives back a node, use this if you just want to create the node as well
            core.setPointer(getMetaNode(node), name, null);
            return core.getChild(getMetaNode(node), '_p_' + name);
        };

        var getMetaAspectsNode = function (node) {
            return core.getChild(getMetaNode(node), 'aspects');
        };
        var getMetaAspectNode = function (node, name) {
            var aspectNode = getMetaAspectsNode(node),
                names = core.getPointerNames(aspectNode) || [];
            if (names.indexOf(name) !== -1) {
                return core.getChild(aspectNode, '_a_' + name);
            }
            return null;
        };

        var _MetaAspectNode = function (node, name) {
            //this function always gives back a node, use this if you just want to create the node as well
            var aspectNode = core.getChild(getMetaNode(node), 'aspects');

            core.setPointer(aspectNode, name, null);
            return core.getChild(aspectNode, '_a_' + name);
        };
        //now the additional functions
        core.isTypeOf = function (node, typeNode) {
            if (!realNode(node)) {
                return false;
            }
            while (node) {
                if (sameNode(node, typeNode)) {
                    return true;
                }
                node = core.getBase(node);
            }
            return false;
        };

        core.isValidChildOf = function (node, parentNode) {
            if (!realNode(node)) {
                return true;
            }
            var validChildTypePaths = core.getMemberPaths(getMetaChildrenNode(parentNode), 'items') || [];
            while (node) {
                if (validChildTypePaths.indexOf(core.getPath(node)) !== -1) {
                    return true;
                }
                node = core.getBase(node);
            }
            return false;
        };

        core.getValidPointerNames = function (node) {
            var validNames = core.getPointerNames(getMetaNode(node)) || [],
                i,
                validPointerNames = [],
                metaPointerNode, max;
            for (i = 0; i < validNames.length; i++) {
                metaPointerNode = getMetaPointerNode(node, validNames[i]);
                max = core.getAttribute(metaPointerNode, 'max');
                if (max === 1) {
                    //TODO specify what makes something a pointer and what a set??? - can you extend a pointer to a set????
                    validPointerNames.push(validNames[i]);
                }
            }

            return validPointerNames;
        };

        core.getValidSetNames = function (node) {
            var validNames = core.getPointerNames(getMetaNode(node)) || [],
                i,
                validSetNames = [],
                metaPointerNode, max;

            for (i = 0; i < validNames.length; i++) {
                metaPointerNode = getMetaPointerNode(node, validNames[i]);
                max = core.getAttribute(metaPointerNode, 'max');
                if (max === undefined || max === -1 || max > 1) {
                    //TODO specify what makes something a pointer and what a set??? - can you extend a pointer to a set????
                    validSetNames.push(validNames[i]);
                }
            }

            return validSetNames;
        };

        core.isValidTargetOf = function (node, source, name) {
            if (!realNode(source) || node === null) { //we position ourselves over the null-pointer layer
                return true;
            }
            var pointerMetaNode = getMetaPointerNode(source, name);
            if (pointerMetaNode) {
                var validTargetTypePaths = core.getMemberPaths(pointerMetaNode, 'items') || [];
                while (node) {
                    if (validTargetTypePaths.indexOf(core.getPath(node)) !== -1) {
                        return true;
                    }
                    node = core.getBase(node);
                }
            }
            return false;
        };

        core.getValidAttributeNames = function (node) {
            var names = [];
            if (realNode(node)) {
                names = core.getAttributeNames(getMetaNode(node)) || [];
            }
            return names;
        };

        core.isValidAttributeValueOf = function (node, name, value) {
            //currently it only checks the name and the type
            if (!realNode(node)) {
                return true;
            }
            if (core.getValidAttributeNames(node).indexOf(name) === -1) {
                return false;
            }
            var meta = core.getAttribute(getMetaNode(node), name);
            switch (meta.type) {
                case 'boolean':
                    if (value === true || value === false) {
                        return true;
                    }
                    break;
                case 'string':
                case 'asset':
                    if (typeof value === 'string') {
                        return true;
                    }
                    break;
                case 'integer':
                    if (!isNaN(parseInt(value)) && parseFloat(value) === parseInt(value)) {
                        return true;
                    }
                    break;
                case 'float':
                    if (!isNaN(parseFloat(value))) {
                        return true;
                    }
                    break;
                default:
                    break;
            }
            return false;
        };


        core.getValidAspectNames = function (node) {
            return core.getPointerNames(getMetaAspectsNode(node)) || [];
        };

        //additional meta functions for getting meta definitions
        core.getJsonMeta = function (node) {
            var meta = {children: {}, attributes: {}, pointers: {}, aspects: {}, constraints: {}},
                tempNode,
                names,
                pointer,
                i, j;

            //fill children part
            tempNode = getMetaChildrenNode(node);

            meta.children.minItems = [];
            meta.children.maxItems = [];
            meta.children.items = core.getMemberPaths(tempNode, 'items');
            for (i = 0; i < meta.children.items.length; i++) {
                meta.children.minItems.push(
                    core.getMemberAttribute(tempNode, 'items', meta.children.items[i], 'min') || -1);

                meta.children.maxItems.push(
                    core.getMemberAttribute(tempNode, 'items', meta.children.items[i], 'max') || -1);
            }
            meta.children.min = core.getAttribute(tempNode, 'min');
            meta.children.max = core.getAttribute(tempNode, 'max');

            //attributes
            names = core.getValidAttributeNames(node);
            for (i = 0; i < names.length; i++) {
                meta.attributes[names[i]] = core.getAttribute(getMetaNode(node), names[i]);
            }

            //pointers
            names = core.getPointerNames(getMetaNode(node));
            for (i = 0; i < names.length; i++) {
                tempNode = getMetaPointerNode(node, names[i]);
                pointer = {};

                pointer.items = core.getMemberPaths(tempNode, 'items');
                pointer.min = core.getAttribute(tempNode, 'min');
                pointer.max = core.getAttribute(tempNode, 'max');
                pointer.minItems = [];
                pointer.maxItems = [];

                for (j = 0; j < pointer.items.length; j++) {
                    pointer.minItems.push(core.getMemberAttribute(tempNode, 'items', pointer.items[j], 'min') || -1);
                    pointer.maxItems.push(core.getMemberAttribute(tempNode, 'items', pointer.items[j], 'max') || -1);

                }

                meta.pointers[names[i]] = pointer;
            }

            //aspects
            names = core.getValidAspectNames(node);

            for (i = 0; i < names.length; i++) {
                tempNode = getMetaAspectNode(node, names[i]);
                meta.aspects[names[i]] = core.getMemberPaths(tempNode, 'items') || [];
            }

            //constraints
            names = core.getConstraintNames(node);
            for (i = 0; i < names.length; i++) {
                meta.constraints[names[i]] = core.getConstraint(node, names[i]);
            }

            return meta;
        };

        var getMetaObjectDiff = function (bigger, smaller) {
            //TODO this is a specific diff calculation for META rule JSONs
            var diff = {},
                names, i,
                itemedElementDiff = function (bigItem, smallItem) {
                    var diffItems = {},
                        diff, i, index, names;
                    for (i = 0; i < bigItem.items.length; i++) {
                        if (smallItem.items.indexOf(bigItem.items[i]) === -1) {
                            diffItems[bigItem.items[i]] = true;
                        }
                    }
                    names = Object.keys(diffItems);
                    for (i = 0; i < names.length; i++) {
                        diff = diff || {items: [], minItems: [], maxItems: []};
                        index = bigItem.items.indexOf(names[i]);
                        diff.items.push(bigItem.items[index]);
                        diff.minItems.push(bigItem.minItems[index]);
                        diff.maxItems.push(bigItem.maxItems[index]);

                    }
                    if (bigItem.min && ((smallItem.min && bigItem.min !== smallItem.min) || !smallItem.min)) {
                        diff = diff || {};
                        diff.min = bigItem.min;
                    }
                    if (bigItem.max && ((smallItem.max && bigItem.max !== smallItem.max) || !smallItem.max)) {
                        diff = diff || {};
                        diff.max = bigItem.max;
                    }
                    return diff || {};
                };
            //attributes
            if (smaller.attributes) {
                names = Object.keys(bigger.attributes);
                for (i = 0; i < names.length; i++) {
                    if (smaller.attributes[names[i]]) {
                        //they both have the attribute - if it differs we keep the whole of the bigger
                        if (CANON.stringify(smaller.attributes[names[i]] !==
                            CANON.stringify(bigger.attributes[names[i]]))) {

                            diff.attributes = diff.attributes || {};
                            diff.attributes[names[i]] = bigger.attributes[names[i]];
                        }
                    } else {
                        diff.attributes = diff.attributes || {};
                        diff.attributes[names[i]] = bigger.attributes[names[i]];
                    }
                }
            } else if (bigger.attributes) {
                diff.attributes = bigger.attributes;
            }
            //children
            if (smaller.children) {
                diff.children = itemedElementDiff(bigger.children, smaller.children);
                if (Object.keys(diff.children).length < 1) {
                    delete diff.children;
                }
            } else if (bigger.children) {
                diff.children = bigger.children;
            }
            //pointers
            if (smaller.pointers) {
                diff.pointers = {};
                names = Object.keys(bigger.pointers);
                for (i = 0; i < names.length; i++) {
                    if (smaller.pointers[names[i]]) {
                        diff.pointers[names[i]] = itemedElementDiff(bigger.pointers[names[i]],
                            smaller.pointers[names[i]]);
                        if (Object.keys(diff.pointers[names[i]]).length < 1) {
                            delete diff.pointers[names[i]];
                        }
                    } else {
                        diff.pointers[names[i]] = bigger.pointers[names[i]];
                    }
                }
            } else if (bigger.pointers) {
                diff.pointers = bigger.pointers;
            }
            if (Object.keys(diff.pointers).length < 1) {
                delete diff.pointers;
            }
            //aspects
            if (smaller.aspects) {
                diff.aspects = {};
                names = Object.keys(bigger.aspects);
                for (i = 0; i < names.length; i++) {
                    if (smaller.aspects[names[i]]) {
                        smaller.aspects[names[i]] = smaller.aspects[names[i]].sort();
                        bigger.aspects[names[i]] = bigger.aspects[names[i]].sort();
                        if (bigger.aspects[names[i]].length > smaller.aspects[names[i]].length) {
                            diff.aspects[names[i]] = bigger.aspects[names[i]].slice(smaller.aspects[names[i]].length);
                        }
                    } else {
                        diff.aspects[names[i]] = bigger.aspects[names[i]];
                    }
                }
            } else if (bigger.aspects) {
                diff.aspects = bigger.aspects;
            }

            if (Object.keys(diff.aspects).length < 1) {
                delete diff.aspects;
            }
            return diff;
        };

        core.getOwnJsonMeta = function (node) {
            var base = core.getBase(node),
                baseMeta = base ? core.getJsonMeta(base) : {},
                meta = core.getJsonMeta(node);

            return getMetaObjectDiff(meta, baseMeta);
        };

        core.clearMetaRules = function (node) {
            core.deleteNode(getMetaNode(node), true);
        };

        core.setAttributeMeta = function (node, name, value) {
            ASSERT(typeof value === 'object' && typeof name === 'string' && name);

            core.setAttribute(getMetaNode(node), name, value);
        };
        core.delAttributeMeta = function (node, name) {
            core.delAttribute(getMetaNode(node), name);
        };
        core.getAttributeMeta = function (node, name) {
            return core.getAttribute(getMetaNode(node), name);
        };

        core.getValidChildrenPaths = function (node) {
            return core.getMemberPaths(getMetaChildrenNode(node), 'items');
        };
        core.setChildMeta = function (node, child, min, max) {
            core.addMember(getMetaChildrenNode(node), 'items', child);
            min = min || -1;
            max = max || -1;
            core.setMemberAttribute(getMetaChildrenNode(node), 'items', core.getPath(child), 'min', min);
            core.setMemberAttribute(getMetaChildrenNode(node), 'items', core.getPath(child), 'max', max);
        };
        core.delChildMeta = function (node, childPath) {
            core.delMember(getMetaChildrenNode(node), 'items', childPath);
        };
        core.setChildrenMetaLimits = function (node, min, max) {
            if (min) {
                core.setAttribute(getMetaChildrenNode(node), 'min', min);
            }
            if (max) {
                core.setAttribute(getMetaChildrenNode(node), 'max', max);
            }
        };

        core.setPointerMetaTarget = function (node, name, target, min, max) {
            core.addMember(_MetaPointerNode(node, name), 'items', target);
            min = min || -1;
            core.setMemberAttribute(_MetaPointerNode(node, name), 'items', core.getPath(target), 'min', min);
            max = max || -1;
            core.setMemberAttribute(_MetaPointerNode(node, name), 'items', core.getPath(target), 'max', max);
        };
        core.delPointerMetaTarget = function (node, name, targetPath) {
            var metaNode = getMetaPointerNode(node, name);
            if (metaNode) {
                core.delMember(metaNode, 'items', targetPath);
            }
        };
        core.setPointerMetaLimits = function (node, name, min, max) {
            if (min) {
                core.setAttribute(_MetaPointerNode(node, name), 'min', min);
            }
            if (max) {
                core.setAttribute(_MetaPointerNode(node, name), 'max', max);
            }
        };
        core.delPointerMeta = function (node, name) {
            core.deleteNode(_MetaPointerNode(node, name), true);
            core.deletePointer(getMetaNode(node), name);
        };

        core.setAspectMetaTarget = function (node, name, target) {
            core.addMember(_MetaAspectNode(node, name), 'items', target);
        };
        core.delAspectMetaTarget = function (node, name, targetPath) {
            var metaNode = getMetaAspectNode(node, name);
            if (metaNode) {
                core.delMember(metaNode, 'items', targetPath);
            }
        };
        core.delAspectMeta = function (node, name) {
            core.deleteNode(_MetaAspectNode(node, name), true);
            core.deletePointer(getMetaAspectsNode(node), name);
        };

        //type related extra query functions
        var isOnMetaSheet = function (node) {
            //MetaAspectSet
            var sets = core.isMemberOf(node);

            if (sets && sets[''] && sets[''].indexOf('MetaAspectSet') !== -1) {
                //TODO this is all should be global constant values
                return true;
            }
            return false;
        };
        core.getBaseType = function (node) {
            //TODO this functions now uses the fact that we think of META as the MetaSetContainer of the ROOT
            while (node) {
                if (isOnMetaSheet(node)) {
                    return node;
                }
                node = core.getBase(node);
            }
            return null;
        };
        core.isInstanceOf = function (node, name) {
            //TODO this is name based query - doesn't check the node's own name
            node = core.getBase(node);
            while (node) {
                if (core.getAttribute(node, 'name') === name) {
                    return true;
                }
                node = core.getBase(node);
            }

            return false;
        };

        return core;
    };

    return MetaCore;
});

/*globals define*/
/*jshint node: true, browser: true*/

/**
 * @author kecso / https://github.com/kecso
 */

define('common/core/coretreeloader',['common/util/assert', 'common/core/core', 'common/core/tasync'], function (ASSERT, Core, TASYNC) {
    

    // ----------------- CoreTreeLoader -----------------

    var MetaCore = function (innerCore, options) {
        ASSERT(typeof options === 'object');
        ASSERT(typeof options.globConf === 'object');
        ASSERT(typeof options.logger !== 'undefined');
        var core = {},
            key,
            logger = options.logger.fork('coretreeloader');
        for (key in innerCore) {
            core[key] = innerCore[key];
        }
        logger.debug('initialized');
        //adding load functions
        core.loadSubTree = function (root) {
            var loadSubTrees = function (nodes) {
                for (var i = 0; i < nodes.length; i++) {
                    nodes[i] = core.loadSubTree(nodes[i]);
                }
                return TASYNC.lift(nodes);

            };
            return TASYNC.call(function (children) {
                if (children.length < 1) {
                    return [root];
                } else {
                    return TASYNC.call(function (subArrays) {
                        var nodes = [],
                            i;
                        for (i = 0; i < subArrays.length; i++) {
                            nodes = nodes.concat(subArrays[i]);
                        }
                        nodes.unshift(root);
                        return nodes;
                    }, loadSubTrees(children));
                }
            }, core.loadChildren(root));
        };
        core.loadTree = function (rootHash) {
            return TASYNC.call(core.loadSubTree, core.loadRoot(rootHash));
        };

        return core;
    };
    return MetaCore;
});

/*globals define*/
/*jshint node: true, browser: true*/

// TODO: This files needs refactoring

/**
 * @author kecso / https://github.com/kecso
 */

define('common/core/corediff',['common/util/canon', 'common/core/tasync', 'common/util/assert'], function (CANON, TASYNC, ASSERT) {
    

    function diffCore(_innerCore, options) {
        ASSERT(typeof options === 'object');
        ASSERT(typeof options.globConf === 'object');
        ASSERT(typeof options.logger !== 'undefined');
        var _core = {},
            logger = options.logger.fork('corediff'),
            _yetToCompute = {},
            _DIFF = {},
            _needChecking = true,
            _rounds = 0,
            TODELETESTRING = '*to*delete*',
            toFrom = {}, //TODO should not be global
            fromTo = {}, //TODO should not be global
            _concatResult,
            _diffMoves = {},
            _conflictItems = [],
            _conflictMine,
            _conflictTheirs,
            _concatBase,
            _concatExtension,
            _concatBaseRemovals,
            _concatMoves;

        logger.debug('initialized');
        for (var i in _innerCore) {
            _core[i] = _innerCore[i];
        }

        function normalize(obj) {
            if (!obj) {
                return obj;
            }
            var keys = Object.keys(obj),
                i;
            for (i = 0; i < keys.length; i++) {
                /*if (Array.isArray(obj[keys[i]])) {
                 if (obj[keys[i]].length === 0) {
                 delete obj[keys[i]];
                 }*/
                if (Array.isArray(obj[keys[i]])) {
                    //do nothing, leave the array as is
                } else if (obj[keys[i]] === undefined) {
                    delete obj[keys[i]]; //there cannot be undefined in the object
                } else if (typeof obj[keys[i]] === 'object') {
                    normalize(obj[keys[i]]);
                    if (obj[keys[i]] && Object.keys(obj[keys[i]]).length === 0) {
                        delete obj[keys[i]];
                    }
                }
            }
            keys = Object.keys(obj);
            if (keys.length === 1) {
                //it only has the GUID, so the node doesn't changed at all
                delete obj.guid;
            }
        }

        function attrDiff(source, target) {
            var sNames = _core.getOwnAttributeNames(source),
                tNames = _core.getOwnAttributeNames(target),
                i,
                diff = {};

            for (i = 0; i < sNames.length; i++) {
                if (tNames.indexOf(sNames[i]) === -1) {
                    diff[sNames[i]] = TODELETESTRING;
                }
            }

            for (i = 0; i < tNames.length; i++) {
                if (_core.getAttribute(source, tNames[i]) === undefined) {
                    diff[tNames[i]] = _core.getAttribute(target, tNames[i]);
                } else {
                    if (CANON.stringify(_core.getAttribute(source, tNames[i])) !==
                        CANON.stringify(_core.getAttribute(target, tNames[i]))) {

                        diff[tNames[i]] = _core.getAttribute(target, tNames[i]);
                    }
                }
            }

            return diff;
        }

        function regDiff(source, target) {
            var sNames = _core.getOwnRegistryNames(source),
                tNames = _core.getOwnRegistryNames(target),
                i,
                diff = {};

            for (i = 0; i < sNames.length; i++) {
                if (tNames.indexOf(sNames[i]) === -1) {
                    diff[sNames[i]] = TODELETESTRING;
                }
            }

            for (i = 0; i < tNames.length; i++) {
                if (_core.getRegistry(source, tNames[i]) === undefined) {
                    diff[tNames[i]] = _core.getRegistry(target, tNames[i]);
                } else {
                    if (CANON.stringify(_core.getRegistry(source, tNames[i])) !==
                        CANON.stringify(_core.getRegistry(target, tNames[i]))) {

                        diff[tNames[i]] = _core.getRegistry(target, tNames[i]);
                    }
                }
            }

            return diff;
        }

        function childrenDiff(source, target) {
            var sRelids = _core.getChildrenRelids(source),
                tRelids = _core.getChildrenRelids(target),
                tHashes = _core.getChildrenHashes(target),
                sHashes = _core.getChildrenHashes(source),
                i,
                diff = {added: [], removed: []};

            for (i = 0; i < sRelids.length; i++) {
                if (tRelids.indexOf(sRelids[i]) === -1) {
                    diff.removed.push({relid: sRelids[i], hash: sHashes[sRelids[i]]});
                }
            }

            for (i = 0; i < tRelids.length; i++) {
                if (sRelids.indexOf(tRelids[i]) === -1) {
                    diff.added.push({relid: tRelids[i], hash: tHashes[tRelids[i]]});
                }
            }

            return diff;

        }

        function pointerDiff(source, target) {
            var getPointerData = function (node) {
                    var data = {},
                        names = _core.getPointerNames(node),
                        i;
                    for (i = 0; i < names.length; i++) {
                        data[names[i]] = _core.getPointerPath(node, names[i]);
                    }
                    return data;
                },
                sPointer = getPointerData(source),
                tPointer = getPointerData(target);

            if (CANON.stringify(sPointer) !== CANON.stringify(tPointer)) {
                return {source: sPointer, target: tPointer};
            }
            return {};
        }

        function setDiff(source, target) {
            var getSetData = function (node) {
                    var data = {},
                        names, targets, keys, i, j, k;

                    names = _core.getSetNames(node);
                    for (i = 0; i < names.length; i++) {
                        data[names[i]] = {};
                        targets = _core.getMemberPaths(node, names[i]);
                        for (j = 0; j < targets.length; j++) {
                            data[names[i]][targets[j]] = {attr: {}, reg: {}};
                            keys = _core.getMemberOwnAttributeNames(node, names[i], targets[j]);
                            for (k = 0; k < keys.length; k++) {
                                data[names[i]][targets[j]].attr[keys[i]] = _core.getMemberAttribute(node,
                                    names[i], targets[j], keys[i]);
                            }
                            keys = _core.getMemberRegistryNames(node, names[i], targets[j]);
                            for (k = 0; k < keys.length; k++) {
                                data[names[i]][targets[j]].reg[keys[k]] = _core.getMemberRegistry(node,
                                    names[i], targets[j], keys[k]);
                            }
                        }
                    }

                    return data;

                },
                sSet = getSetData(source),
                tSet = getSetData(target);

            if (CANON.stringify(sSet) !== CANON.stringify(tSet)) {
                return {source: sSet, target: tSet};
            }
            return {};
        }

        function ovrDiff(source, target) {
            var getOvrData = function (node) {
                    var paths, names, i, j,
                        ovr = _core.getProperty(node, 'ovr') || {},
                        data = {},
                        base = _core.getPath(node);

                    paths = Object.keys(ovr);
                    for (i = 0; i < paths.length; i++) {
                        if (paths[i].indexOf('_') === -1) {
                            data[paths[i]] = {};
                            names = Object.keys(ovr[paths[i]]);
                            for (j = 0; j < names.length; j++) {
                                if (ovr[paths[i]][names[j]] === '/_nullptr') {
                                    data[paths[i]][names[j]] = null;
                                } else if (names[j].slice(-4) !== '-inv' &&
                                    ovr[paths[i]][names[j]].indexOf('_') === -1) {

                                    data[paths[i]][names[j]] = _core.joinPaths(base, ovr[paths[i]][names[j]]);
                                }
                            }
                        }
                    }
                    return data;
                },
                sOvr = getOvrData(source),
                tOvr = getOvrData(target);

            if (CANON.stringify(sOvr) !== CANON.stringify(tOvr)) {
                return {source: sOvr, target: tOvr};
            }
            return {};
        }

        function metaDiff(source, target) {
            var sMeta = _core.getOwnJsonMeta(source),
                tMeta = _core.getOwnJsonMeta(target);
            if (CANON.stringify(sMeta) !== CANON.stringify(tMeta)) {
                return {source: sMeta, target: tMeta};
            }
            return {};
        }

        function combineMoveIntoMetaDiff(diff) {
            var keys = Object.keys(diff),
                i;
            for (i = 0; i < keys.length; i++) {
                if (_diffMoves[keys[i]]) {
                    diff[_diffMoves[keys[i]]] = diff[keys[i]];
                    delete diff[keys[i]];
                } else if (typeof diff[keys[i]] === 'object') {
                    combineMoveIntoMetaDiff(diff[keys[i]]);
                }
            }
        }

        function combineMoveIntoPointerDiff(diff) {
            var keys = Object.keys(diff),
                i;
            for (i = 0; i < keys.length; i++) {
                if (_diffMoves[diff[keys[i]]]) {
                    diff[keys[i]] = _diffMoves[diff[keys[i]]];
                }
            }
        }

        function finalizeDiff() {
            finalizeMetaDiff(_DIFF);
            finalizePointerDiff(_DIFF);
            finalizeSetDiff(_DIFF);
            normalize(_DIFF);
        }

        function finalizeMetaDiff(diff) {
            //at this point _DIFF is ready and the _diffMoves is complete...
            var relids = getDiffChildrenRelids(diff),
                i, sMeta, tMeta;
            if (diff.meta) {
                sMeta = diff.meta.source || {};
                tMeta = diff.meta.target || {};
                combineMoveIntoMetaDiff(sMeta);
                diff.meta = diffObjects(sMeta, tMeta);
            }
            for (i = 0; i < relids.length; i++) {
                finalizeMetaDiff(diff[relids[i]]);
            }
        }

        function finalizePointerDiff(diff) {
            var relids = getDiffChildrenRelids(diff),
                i, sPointer, tPointer;
            if (diff.pointer) {
                sPointer = diff.pointer.source || {};
                tPointer = diff.pointer.target || {};
                /*if(diff.movedFrom && !sPointer.base && tPointer.base){
                 delete tPointer.base;
                 }*/
                combineMoveIntoPointerDiff(sPointer);
                diff.pointer = diffObjects(sPointer, tPointer);
            }
            for (i = 0; i < relids.length; i++) {
                finalizePointerDiff(diff[relids[i]]);
            }
        }

        function finalizeSetDiff(diff) {
            var relids = getDiffChildrenRelids(diff),
                i, sSet, tSet;
            if (diff.set) {
                sSet = diff.set.source || {};
                tSet = diff.set.target || {};
                combineMoveIntoMetaDiff(sSet);
                diff.set = diffObjects(sSet, tSet);
            }
            for (i = 0; i < relids.length; i++) {
                finalizeSetDiff(diff[relids[i]]);
            }
        }

        function isEmptyNodeDiff(diff) {
            if (
                Object.keys(diff.children || {}).length > 0 ||
                Object.keys(diff.attr || {}).length > 0 ||
                Object.keys(diff.reg || {}).length > 0 ||
                Object.keys(diff.pointer || {}).length > 0 ||
                Object.keys(diff.set || {}).length > 0 ||
                diff.meta
            ) {
                return false;
            }
            return true;
        }

        function getPathOfDiff(diff, path) {
            var pathArray = (path || '').split('/'),
                i;
            pathArray.shift();
            for (i = 0; i < pathArray.length; i++) {
                diff[pathArray[i]] = diff[pathArray[i]] || {};
                diff = diff[pathArray[i]];
            }

            return diff;
        }

        function extendDiffWithOvr(diff, oDiff) {
            var i, paths, names, j, tDiff;
            //first extend sources
            paths = Object.keys(oDiff.source || {});
            for (i = 0; i < paths.length; i++) {
                tDiff = getPathOfDiff(diff, paths[i]);
                if (tDiff.removed !== true) {
                    tDiff.pointer = tDiff.pointer || {source: {}, target: {}};
                    names = Object.keys(oDiff.source[paths[i]]);
                    for (j = 0; j < names.length; j++) {
                        tDiff.pointer.source[names[j]] = oDiff.source[paths[i]][names[j]];
                    }
                }
            }
            //then targets
            paths = Object.keys(oDiff.target || {});
            for (i = 0; i < paths.length; i++) {
                tDiff = getPathOfDiff(diff, paths[i]);
                if (tDiff.removed !== true) {
                    tDiff.pointer = tDiff.pointer || {source: {}, target: {}};
                    names = Object.keys(oDiff.target[paths[i]]);
                    for (j = 0; j < names.length; j++) {
                        tDiff.pointer.target[names[j]] = oDiff.target[paths[i]][names[j]];
                    }
                }
            }
        }

        function updateDiff(sourceRoot, targetRoot) {
            var diff = _core.nodeDiff(sourceRoot, targetRoot) || {},
                oDiff = ovrDiff(sourceRoot, targetRoot),
                getChild = function (childArray, relid) {
                    for (var i = 0; i < childArray.length; i++) {
                        if (_core.getRelid(childArray[i]) === relid) {
                            return childArray[i];
                        }
                    }
                    return null;
                };
            return TASYNC.call(function (sChildren, tChildren) {
                ASSERT(sChildren.length >= 0 && tChildren.length >= 0);

                var i, child, done, tDiff, guid, base,
                    childComputationFinished = function (cDiff, relid/*, d*/) {
                        diff[relid] = cDiff;
                        return null;
                    };

                tDiff = diff.children ? diff.children.removed || [] : [];
                for (i = 0; i < tDiff.length; i++) {
                    diff.childrenListChanged = true;
                    child = getChild(sChildren, tDiff[i].relid);
                    if (child) {
                        guid = _core.getGuid(child);
                        diff[tDiff[i].relid] = {guid: guid, removed: true, hash: _core.getHash(child)};
                        _yetToCompute[guid] = _yetToCompute[guid] || {};
                        _yetToCompute[guid].from = child;
                        _yetToCompute[guid].fromExpanded = false;
                    }
                }

                tDiff = diff.children ? diff.children.added || [] : [];
                for (i = 0; i < tDiff.length; i++) {
                    diff.childrenListChanged = true;
                    child = getChild(tChildren, tDiff[i].relid);
                    if (child) {
                        guid = _core.getGuid(child);
                        base = _core.getBase(child);
                        if (base) {
                            base = _core.getPath(base);
                        }
                        diff[tDiff[i].relid] = {
                            guid: guid,
                            removed: false,
                            hash: _core.getHash(child),
                            pointer: {source: {}, target: {base: base}}
                        };
                        _yetToCompute[guid] = _yetToCompute[guid] || {};
                        _yetToCompute[guid].to = child;
                        _yetToCompute[guid].toExpanded = false;
                    }
                }

                for (i = 0; i < tChildren.length; i++) {
                    child = getChild(sChildren, _core.getRelid(tChildren[i]));
                    if (child && _core.getHash(tChildren[i]) !== _core.getHash(child)) {
                        done = TASYNC.call(childComputationFinished,
                            updateDiff(child, tChildren[i]), _core.getRelid(child), done);
                    }
                }
                return TASYNC.call(function () {
                    delete diff.children;
                    extendDiffWithOvr(diff, oDiff);
                    normalize(diff);
                    if (Object.keys(diff).length > 0) {
                        diff.guid = _core.getGuid(targetRoot);
                        diff.hash = _core.getHash(targetRoot);
                        diff.oGuids = gatherObstructiveGuids(targetRoot);
                        return TASYNC.call(function (finalDiff) {
                            return finalDiff;
                        }, fillMissingGuid(targetRoot, '', diff));
                    } else {
                        return diff;
                    }

                }, done);
            }, _core.loadChildren(sourceRoot), _core.loadChildren(targetRoot));
        }

        function gatherObstructiveGuids(node) {
            var result = {},
                putParents = function (n) {
                    while (n) {
                        result[_core.getGuid(n)] = true;
                        n = _core.getParent(n);
                    }
                };
            while (node) {
                putParents(node);
                node = _core.getBase(node);
            }
            return result;
        }

        function fillMissingGuid(root, path, diff) {
            var relids = getDiffChildrenRelids(diff),
                i,
                done,
                subComputationFinished = function (cDiff, relid) {
                    diff[relid] = cDiff;
                    return null;
                };

            for (i = 0; i < relids.length; i++) {
                done = TASYNC.call(subComputationFinished,
                    fillMissingGuid(root, path + '/' + relids[i], diff[relids[i]]), relids[i]);
            }

            return TASYNC.call(function () {
                if (diff.guid) {
                    return diff;
                } else {
                    return TASYNC.call(function (child) {
                        diff.guid = _core.getGuid(child);
                        diff.hash = _core.getHash(child);
                        diff.oGuids = gatherObstructiveGuids(child);
                        return diff;
                    }, _core.loadByPath(root, path));
                }
            }, done);
        }

        function expandDiff(root, isDeleted) {
            var diff = {
                guid: _core.getGuid(root),
                hash: _core.getHash(root),
                removed: isDeleted === true
            };
            return TASYNC.call(function (children) {
                var guid;
                for (var i = 0; i < children.length; i++) {
                    guid = _core.getGuid(children[i]);
                    diff[_core.getRelid(children[i])] = {
                        guid: guid,
                        hash: _core.getHash(children[i]),
                        removed: isDeleted === true
                    };

                    if (isDeleted) {
                        _yetToCompute[guid] = _yetToCompute[guid] || {};
                        _yetToCompute[guid].from = children[i];
                        _yetToCompute[guid].fromExpanded = false;
                    } else {
                        _yetToCompute[guid] = _yetToCompute[guid] || {};
                        _yetToCompute[guid].to = children[i];
                        _yetToCompute[guid].toExpanded = false;
                    }
                }
                return diff;
            }, _core.loadChildren(root));
        }

        function insertIntoDiff(path, diff) {
            var pathArray = path.split('/'),
                relid = pathArray.pop(),
                sDiff = _DIFF,
                i;
            pathArray.shift();
            for (i = 0; i < pathArray.length; i++) {
                sDiff = sDiff[pathArray[i]];
            }
            //sDiff[relid] = diff;
            sDiff[relid] = mergeObjects(sDiff[relid], diff);
        }

        function diffObjects(source, target) {
            var diff = {},
                sKeys = Object.keys(source),
                tKeys = Object.keys(target),
                tDiff, i;
            for (i = 0; i < sKeys.length; i++) {
                if (tKeys.indexOf(sKeys[i]) === -1) {
                    diff[sKeys[i]] = TODELETESTRING;
                }
            }
            for (i = 0; i < tKeys.length; i++) {
                if (sKeys.indexOf(tKeys[i]) === -1) {
                    diff[tKeys[i]] = target[tKeys[i]];
                } else {
                    if (typeof target[tKeys[i]] === typeof source[tKeys[i]] &&
                        typeof target[tKeys[i]] === 'object' &&
                        (target[tKeys[i]] !== null && source[tKeys[i]] !== null)) {
                        tDiff = diffObjects(source[tKeys[i]], target[tKeys[i]]);
                        if (Object.keys(tDiff).length > 0) {
                            diff[tKeys[i]] = tDiff;
                        }
                    } else if (source[tKeys[i]] !== target[tKeys[i]]) {
                        diff[tKeys[i]] = target[tKeys[i]];
                    }
                }
            }
            return diff;
        }

        function mergeObjects(source, target) {
            var merged = {},
                sKeys = Object.keys(source),
                tKeys = Object.keys(target),
                i;
            for (i = 0; i < sKeys.length; i++) {
                merged[sKeys[i]] = source[sKeys[i]];
            }
            for (i = 0; i < tKeys.length; i++) {
                if (sKeys.indexOf(tKeys[i]) === -1) {
                    merged[tKeys[i]] = target[tKeys[i]];
                } else {
                    if (typeof target[tKeys[i]] === typeof source[tKeys[i]] &&
                        typeof target[tKeys[i]] === 'object' && !(target instanceof Array)) {
                        merged[tKeys[i]] = mergeObjects(source[tKeys[i]], target[tKeys[i]]);
                    } else {
                        merged[tKeys[i]] = target[tKeys[i]];
                    }
                }
            }

            return merged;
        }

        function removePathFromDiff(diff, path) {
            var relId, i;
            if (path === '') {
                diff = null;
            } else {
                path = path.split('/');
                path.shift();
                relId = path.pop();
                for (i = 0; i < path.length; i++) {
                    diff = diff[path[i]];
                }
                delete diff[relId];
            }
        }

        function shrinkDiff(rootDiff) {
            var _shrink = function (diff) {
                if (diff) {
                    var keys = getDiffChildrenRelids(diff),
                        i;
                    if (typeof diff.movedFrom === 'string') {
                        removePathFromDiff(rootDiff, diff.movedFrom);
                    }

                    if (diff.removed !== false || typeof diff.movedFrom === 'string') {
                        delete diff.hash;
                    }

                    if (diff.removed === true) {
                        for (i = 0; i < keys.length; i++) {
                            delete diff[keys[i]];
                        }
                    } else {

                        for (i = 0; i < keys.length; i++) {
                            _shrink(diff[keys[i]]);
                        }
                    }
                }
            };
            _shrink(rootDiff, false);
        }

        function checkRound() {
            var guids = Object.keys(_yetToCompute),
                done, ytc,
                i,
                computingMove = function (mDiff, info) {
                    mDiff.guid = _core.getGuid(info.from);
                    mDiff.movedFrom = _core.getPath(info.from);
                    mDiff.ooGuids = gatherObstructiveGuids(info.from);
                    _diffMoves[_core.getPath(info.from)] = _core.getPath(info.to);
                    insertAtPath(_DIFF, _core.getPath(info.to), mDiff);
                    return null;
                },
                expandFrom = function (mDiff, info) {
                    mDiff.hash = _core.getHash(info.from);
                    mDiff.removed = true;
                    insertIntoDiff(_core.getPath(info.from), mDiff);
                    return null;
                },
                expandTo = function (mDiff, info) {
                    if (!mDiff.hash) {
                        mDiff.hash = _core.getHash(info.to);
                    }
                    mDiff.removed = false;
                    insertIntoDiff(_core.getPath(info.to), mDiff);
                    return null;
                };

            if (_needChecking !== true || guids.length < 1) {
                shrinkDiff(_DIFF);
                finalizeDiff();
                return _DIFF;
            }
            _needChecking = false;
            for (i = 0; i < guids.length; i++) {
                ytc = _yetToCompute[guids[i]];
                if (ytc.from && ytc.to) {
                    //move
                    _needChecking = true;
                    delete _yetToCompute[guids[i]];
                    done = TASYNC.call(computingMove, updateDiff(ytc.from, ytc.to), ytc);
                } else {
                    if (ytc.from && ytc.fromExpanded === false) {
                        //expand from
                        ytc.fromExpanded = true;
                        _needChecking = true;
                        done = TASYNC.call(expandFrom, expandDiff(ytc.from, true), ytc);
                    } else if (ytc.to && ytc.toExpanded === false) {
                        //expand to
                        ytc.toExpanded = true;
                        _needChecking = true;
                        done = TASYNC.call(expandTo, expandDiff(ytc.to, false), ytc);
                    }
                }
            }
            return TASYNC.call(function () {
                return checkRound();
            }, done);
        }

        _core.nodeDiff = function (source, target) {
            var diff = {
                children: childrenDiff(source, target),
                attr: attrDiff(source, target),
                reg: regDiff(source, target),
                pointer: pointerDiff(source, target),
                set: setDiff(source, target),
                meta: metaDiff(source, target)
            };

            normalize(diff);
            return isEmptyNodeDiff(diff) ? null : diff;
        };

        _core.generateTreeDiff = function (sRoot, tRoot) {
            _yetToCompute = {};
            _DIFF = {};
            _diffMoves = {};
            _needChecking = true;
            _rounds = 0;
            return TASYNC.call(function (d) {
                _DIFF = d;
                return checkRound();
            }, updateDiff(sRoot, tRoot));
        };

        _core.generateLightTreeDiff = function (sRoot, tRoot) {
            return updateDiff(sRoot, tRoot);
        };

        function getDiffChildrenRelids(diff) {
            var keys = Object.keys(diff),
                i,
                filteredKeys = [],
                forbiddenWords = {
                    guid: true,
                    hash: true,
                    attr: true,
                    reg: true,
                    pointer: true,
                    set: true,
                    meta: true,
                    removed: true,
                    movedFrom: true,
                    childrenListChanged: true,
                    oGuids: true,
                    ooGuids: true,
                    min: true,
                    max: true
                };
            for (i = 0; i < keys.length; i++) {
                if (!forbiddenWords[keys[i]]) {
                    filteredKeys.push(keys[i]);
                }
            }
            return filteredKeys;
        }

        function getMoveSources(diff, path, toFrom, fromTo) {
            var relids = getDiffChildrenRelids(diff),
                i;

            for (i = 0; i < relids.length; i++) {
                getMoveSources(diff[relids[i]], path + '/' + relids[i], toFrom, fromTo);
            }

            if (typeof diff.movedFrom === 'string') {
                toFrom[path] = diff.movedFrom;
                fromTo[diff.movedFrom] = path;
            }
        }

        function getAncestor(node, path) {
            var ownPath = _core.getPath(node),
                ancestorPath = '',
                i;
            path = path.split('/');
            ownPath = ownPath.split('/');
            ownPath.shift();
            path.shift();
            for (i = 0; i < ownPath.length; i++) {
                if (ownPath[i] === path[i]) {
                    ancestorPath = ancestorPath + '/' + ownPath[i];
                } else {
                    break;
                }
            }
            ownPath = _core.getPath(node);
            while (ownPath !== ancestorPath) {
                node = _core.getParent(node);
                ownPath = _core.getPath(node);
            }
            return node;
        }

        function setBaseOfNewNode(node, relid, basePath) {
            //TODO this is a kind of low level hack so maybe there should be another way to do this
            var ancestor = getAncestor(node, basePath),
                sourcePath = _core.getPath(node).substr(_core.getPath(ancestor).length),
                targetPath = basePath.substr(_core.getPath(ancestor).length);
            sourcePath = sourcePath + '/' + relid;
            _innerCore.overlayInsert(_core.getChild(ancestor, 'ovr'), sourcePath, 'base', targetPath);
        }

        function makeInitialContainmentChanges(node, diff) {
            var relids = getDiffChildrenRelids(diff),
                i, done, child, moved,
                moving = function (n, di, p, m/*, d*/) {
                    if (m === true) {
                        n = _core.moveNode(n, p);
                    }
                    return makeInitialContainmentChanges(n, di);
                };

            for (i = 0; i < relids.length; i++) {
                moved = false;
                if (diff[relids[i]].movedFrom) {
                    //moved node
                    moved = true;
                    child = _core.loadByPath(_core.getRoot(node), diff[relids[i]].movedFrom);
                } else if (diff[relids[i]].removed === false) {
                    //added node
                    //first we hack the pointer, then we create the node
                    if (diff[relids[i]].pointer && diff[relids[i]].pointer.base) {
                        //we can set base if the node has one, otherwise it is 'inheritance internal' node
                        setBaseOfNewNode(node, relids[i], diff[relids[i]].pointer.base);
                    }
                    if (diff[relids[i]].hash) {
                        _core.setProperty(node, relids[i], diff[relids[i]].hash);
                        child = _core.loadChild(node, relids[i]);
                    } else {
                        child = _core.getChild(node, relids[i]);
                        _core.setHashed(child, true);
                    }
                } else {
                    //simple node
                    child = _core.loadChild(node, relids[i]);
                }

                done = TASYNC.call(moving, child, diff[relids[i]], node, moved, done);
            }

            TASYNC.call(function (/*d*/) {
                return null;
            }, done);
        }

        function applyNodeChange(root, path, nodeDiff) {
            //check for move
            var node;
            node = _core.loadByPath(root, path);

            return TASYNC.call(function (n) {
                var done,
                    relids = getDiffChildrenRelids(nodeDiff),
                    i;
                if (nodeDiff.removed === true) {
                    _core.deleteNode(n);
                    return;
                }
                applyAttributeChanges(n, nodeDiff.attr || {});
                applyRegistryChanges(n, nodeDiff.reg || {});
                done = applyPointerChanges(n, nodeDiff.pointer || {});
                done = TASYNC.call(applySetChanges, n, nodeDiff.set || {}, done);
                if (nodeDiff.meta) {
                    delete nodeDiff.meta.empty;
                    done = TASYNC.call(applyMetaChanges, n, nodeDiff.meta, done);
                }
                for (i = 0; i < relids.length; i++) {
                    /*done = TASYNC.call(function () {
                     return null;
                     }, applyNodeChange(root, path + '/' + relids[i], nodeDiff[relids[i]]), done);*/
                    done = TASYNC.join(done, applyNodeChange(root, path + '/' + relids[i], nodeDiff[relids[i]]));
                }
                /*TASYNC.call(function (d) {
                 return done;
                 }, done);*/
                return done;
            }, node);
        }

        function applyAttributeChanges(node, attrDiff) {
            var i, keys;
            keys = Object.keys(attrDiff);
            for (i = 0; i < keys.length; i++) {
                if (attrDiff[keys[i]] === TODELETESTRING) {
                    _core.delAttribute(node, keys[i]);
                } else {
                    _core.setAttribute(node, keys[i], attrDiff[keys[i]]);
                }
            }
        }

        function applyRegistryChanges(node, regDiff) {
            var i, keys;
            keys = Object.keys(regDiff);
            for (i = 0; i < keys.length; i++) {
                if (regDiff[keys[i]] === TODELETESTRING) {
                    _core.delRegistry(node, keys[i]);
                } else {
                    _core.setRegistry(node, keys[i], regDiff[keys[i]]);
                }
            }
        }

        function setPointer(node, name, target) {
            var targetNode;
            if (target === null) {
                targetNode = null;
            } else {
                if (fromTo[target]) {
                    target = fromTo[target];
                }
                targetNode = _core.loadByPath(_core.getRoot(node), target);
            }
            return TASYNC.call(function (t) {
                //TODO watch if handling of base changes!!!
                _core.setPointer(node, name, t);
                return;
            }, targetNode);
        }

        function applyPointerChanges(node, pointerDiff) {
            var done,
                keys = Object.keys(pointerDiff),
                i;
            for (i = 0; i < keys.length; i++) {
                if (pointerDiff[keys[i]] === TODELETESTRING) {
                    _core.deletePointer(node, keys[i]);
                } else {
                    done = setPointer(node, keys[i], pointerDiff[keys[i]]);
                }
            }

            return TASYNC.call(function (/*d*/) {
                return null;
            }, done);

        }

        function addMember(node, name, target, data) {
            var memberAttrSetting = function (diff) {
                    var keys = _core.getMemberOwnAttributeNames(node, name, target),
                        i;
                    for (i = 0; i < keys.length; i++) {
                        _core.delMemberAttribute(node, name, target, keys[i]);
                    }

                    keys = Object.keys(diff);
                    for (i = 0; i < keys.length; i++) {
                        _core.setMemberAttribute(node, name, target, keys[i], diff[keys[i]]);
                    }
                },
                memberRegSetting = function (diff) {
                    var keys = _core.getMemberOwnRegistryNames(node, name, target),
                        i;
                    for (i = 0; i < keys.length; i++) {
                        _core.delMemberRegistry(node, name, target, keys[i]);
                    }

                    keys = Object.keys(diff);
                    for (i = 0; i < keys.length; i++) {
                        _core.setMemberRegistry(node, name, target, keys[i], diff[keys[i]]);
                    }
                };
            return TASYNC.call(function (t) {
                _core.addMember(node, name, t);
                memberAttrSetting(data.attr || {});
                memberRegSetting(data.reg || {});
                return;
            }, _core.loadByPath(_core.getRoot(node), target));
        }

        function applySetChanges(node, setDiff) {
            var done,
                setNames = Object.keys(setDiff),
                elements, i, j;
            for (i = 0; i < setNames.length; i++) {
                if (setDiff[setNames[i]] === TODELETESTRING) {
                    _core.deleteSet(node, setNames[i]);
                } else {
                    elements = Object.keys(setDiff[setNames[i]]);
                    for (j = 0; j < elements.length; j++) {
                        if (setDiff[setNames[i]][elements[j]] === TODELETESTRING) {
                            _core.delMember(node, setNames[i], elements[j]);
                        } else {
                            done = addMember(node, setNames[i], elements[j], setDiff[setNames[i]][elements[j]]);
                        }
                    }
                }
            }

            return TASYNC.call(function (/*d*/) {
                return null;
            }, done);

        }

        function applyMetaAttributes(node, metaAttrDiff) {
            var i, keys, newValue;
            if (metaAttrDiff === TODELETESTRING) {
                //we should delete all MetaAttributes
                keys = _core.getValidAttributeNames(node);
                for (i = 0; i < keys.length; i++) {
                    _core.delAttributeMeta(node, keys[i]);
                }
            } else {
                keys = Object.keys(metaAttrDiff);
                for (i = 0; i < keys.length; i++) {
                    if (metaAttrDiff[keys[i]] === TODELETESTRING) {
                        _core.delAttributeMeta(node, keys[i]);
                    } else {
                        newValue = jsonConcat(_core.getAttributeMeta(node, keys[i]) || {}, metaAttrDiff[keys[i]]);
                        _core.setAttributeMeta(node, keys[i], newValue);
                    }
                }
            }
        }

        function applyMetaConstraints(node, metaConDiff) {
            var keys, i;
            if (metaConDiff === TODELETESTRING) {
                //remove all constraints
                keys = _core.getConstraintNames(node);
                for (i = 0; i < keys.length; i++) {
                    _core.delConstraint(node, keys[i]);
                }
            } else {
                keys = Object.keys(metaConDiff);
                for (i = 0; i < keys.length; i++) {
                    if (metaConDiff[keys[i]] === TODELETESTRING) {
                        _core.delConstraint(node, keys[i]);
                    } else {
                        _core.setConstraint(node, keys[i], jsonConcat(_core.getConstraint(node, keys[i]) || {},
                            metaConDiff[keys[i]]));
                    }
                }
            }
        }

        function applyMetaChildren(node, metaChildrenDiff) {
            var keys, i, done,
                setChild = function (target, data/*, d*/) {
                    _core.setChildMeta(node, target, data.min, data.max);
                };
            if (metaChildrenDiff === TODELETESTRING) {
                //remove all valid child
                keys = _core.getValidChildrenPaths(node);
                for (i = 0; i < keys.length; i++) {
                    _core.delChildMeta(node, keys[i]);
                }
            } else {
                _core.setChildrenMetaLimits(node, metaChildrenDiff.min, metaChildrenDiff.max);
                delete metaChildrenDiff.max; //TODO we do not need it anymore, but maybe there is a better way
                delete metaChildrenDiff.min;
                keys = Object.keys(metaChildrenDiff);
                for (i = 0; i < keys.length; i++) {
                    if (metaChildrenDiff[keys[i]] === TODELETESTRING) {
                        _core.delChildMeta(node, keys[i]);
                    } else {
                        done = TASYNC.call(setChild, _core.loadByPath(_core.getRoot(node), keys[i]),
                            metaChildrenDiff[keys[i]], done);
                    }
                }
            }

            TASYNC.call(function (/*d*/) {
                return null;
            }, done);
        }

        function applyMetaPointers(node, metaPointerDiff) {
            var names, targets, i, j, done,
                setPointer = function (name, target, data/*, d*/) {
                    _core.setPointerMetaTarget(node, name, target, data.min, data.max);
                };
            if (metaPointerDiff === TODELETESTRING) {
                //remove all pointers,sets and their targets
                names = _core.getValidPointerNames(node);
                for (i = 0; i < names.length; i++) {
                    _core.delPointerMeta(node, names[i]);
                }

                names = _core.getValidSetNames(node);
                for (i = 0; i < names.length; i++) {
                    _core.delPointerMeta(node, names[i]);
                }
                return;
            }

            names = Object.keys(metaPointerDiff);
            for (i = 0; i < names.length; i++) {
                if (metaPointerDiff[names[i]] === TODELETESTRING) {
                    _core.delPointerMeta(node, names[i]);
                } else {
                    _core.setPointerMetaLimits(node, names[i], metaPointerDiff[names[i]].min,
                        metaPointerDiff[names[i]].max);
                    //TODO we do not need it anymore, but maybe there is a better way
                    delete metaPointerDiff[names[i]].max;
                    delete metaPointerDiff[names[i]].min;
                    targets = Object.keys(metaPointerDiff[names[i]]);
                    for (j = 0; j < targets.length; j++) {
                        if (metaPointerDiff[names[i]][targets[j]] === TODELETESTRING) {
                            _core.delPointerMetaTarget(node, names[i], targets[j]);
                        } else {
                            done = TASYNC.call(setPointer, names[i], _core.loadByPath(_core.getRoot(node), targets[j]),
                                metaPointerDiff[names[i]][targets[j]], done);
                        }
                    }
                }
            }

            TASYNC.call(function (/*d*/) {
                return null;
            }, done);
        }

        function applyMetaAspects(node, metaAspectsDiff) {
            var names, targets, i, j, done,
                setAspect = function (name, target/*, d*/) {
                    _core.setAspectMetaTarget(node, name, target);
                };
            if (metaAspectsDiff === TODELETESTRING) {
                //remove all aspects
                names = _core.getValidAspectNames(node);
                for (i = 0; i < names.length; i++) {
                    _core.delAspectMeta(node, names[i]);
                }
                return;
            }

            names = Object.keys(metaAspectsDiff);
            for (i = 0; i < names.length; i++) {
                if (metaAspectsDiff[names[i]] === TODELETESTRING) {
                    _core.delAspectMeta(node, names[i]);
                } else {
                    targets = Object.keys(metaAspectsDiff[names[i]]);
                    for (j = 0; j < targets.length; j++) {
                        if (metaAspectsDiff[names[i]][targets[j]] === TODELETESTRING) {
                            _core.delAspectMetaTarget(node, names[i], targets[j]);
                        } else {
                            done = TASYNC.call(setAspect, names[i], _core.loadByPath(_core.getRoot(node), targets[j]),
                                done);
                        }
                    }
                }
            }

            TASYNC.call(function (/*d*/) {
                return null;
            }, done);
        }

        function applyMetaChanges(node, metaDiff) {
            var done;
            applyMetaAttributes(node, metaDiff.attributes || TODELETESTRING);
            applyMetaConstraints(node, metaDiff.constraints || TODELETESTRING);
            done = applyMetaChildren(node, metaDiff.children || TODELETESTRING);
            done = TASYNC.call(applyMetaPointers, node, metaDiff.pointers || TODELETESTRING, done);
            done = TASYNC.call(applyMetaAspects, node, metaDiff.aspects || TODELETESTRING, done);

            TASYNC.call(function (/*d*/) {
                return null;
            }, done);
        }

        _core.applyTreeDiff = function (root, diff) {

            toFrom = {};
            fromTo = {};
            getMoveSources(diff, '', toFrom, fromTo);

            return TASYNC.join(makeInitialContainmentChanges(root, diff), applyNodeChange(root, '', diff));
        };

        function getNodeByGuid(diff, guid) {
            var relids, i, temp;
            if (diff.guid === guid) {
                return diff;
            }

            relids = getDiffChildrenRelids(diff);
            for (i = 0; i < relids.length; i++) {
                temp = getNodeByGuid(diff[relids[i]], guid);
                if (temp) {
                    return temp;
                }
            }
            return null;
        }

        function insertAtPath(diff, path, object) {
            ASSERT(typeof path === 'string');
            var i, base, relid, nodepath;
            if (path === '') {
                _concatResult = JSON.parse(JSON.stringify(object));
                return;
            }
            nodepath = path.match(/\/\/.*\/\//) || [];
            nodepath = nodepath[0] || 'there is no nodepath in the path';
            path = path.replace(nodepath, '/*nodepath*/');
            nodepath = nodepath.replace(/\/\//g, '/');
            nodepath = nodepath.slice(0, -1);
            path = path.split('/');
            path.shift();
            if (path.indexOf('*nodepath*') !== -1) {
                path[path.indexOf('*nodepath*')] = nodepath;
            }
            relid = path.pop();
            base = diff;
            for (i = 0; i < path.length; i++) {
                base[path[i]] = base[path[i]] || {};
                base = base[path[i]];
            }
            base[relid] = JSON.parse(JSON.stringify(object));
            return;
        }

        //FIXME check if it is really depreciated
        //function changeMovedPaths(singleNode) {
        //    var keys, i;
        //    keys = Object.keys(singleNode);
        //    for (i = 0; i < keys.length; i++) {
        //        if (_concatMoves.fromTo[keys[i]]) {
        //            singleNode[_concatMoves.fromTo[keys[i]]] = singleNode[keys[i]];
        //            delete singleNode[keys[i]];
        //            if (typeof singleNode[_concatMoves.fromTo[keys[i]]] === 'object' &&
        //                singleNode[_concatMoves.fromTo[keys[i]]] !== null) {
        //
        //                changeMovedPaths(singleNode[_concatMoves.fromTo[keys[i]]]);
        //            }
        //        } else {
        //            if (typeof singleNode[keys[i]] === 'string' && keys[i] !== 'movedFrom' &&
        //                _concatMoves.fromTo[singleNode[keys[i]]]) {
        //
        //                singleNode[keys[i]] = _concatMoves.fromTo[keys[i]];
        //            }
        //
        //            if (typeof singleNode[keys[i]] === 'object' && singleNode[keys[i]] !== null) {
        //                changeMovedPaths(singleNode[keys[i]]);
        //            }
        //        }
        //
        //    }
        //    if (typeof singleNode === 'object' && singleNode !== null) {
        //        keys = Object.keys(singleNode);
        //        for (i = 0; i < keys.length; i++) {
        //            if (_concatMoves.fromTo[keys[i]]) {
        //                singleNode[_concatMoves.fromTo[keys[i]]] = singleNode[keys[i]];
        //                delete singleNode[keys[i]];
        //            }
        //        }
        //    } else if (typeof singleNode === 'string') {
        //
        //    }
        //
        //}

        function getSingleNode(node) {
            //removes the children from the node
            var result = JSON.parse(JSON.stringify(node)),
                keys = getDiffChildrenRelids(result),
                i;
            for (i = 0; i < keys.length; i++) {
                delete result[keys[i]];
            }
            //changeMovedPaths(result);
            return result;
        }

        function jsonConcat(base, extension) {
            var baseKeys = Object.keys(base),
                extKeys = Object.keys(extension),
                concat = JSON.parse(JSON.stringify(base)),
                i;
            for (i = 0; i < extKeys.length; i++) {
                if (baseKeys.indexOf(extKeys[i]) === -1) {
                    concat[extKeys[i]] = JSON.parse(JSON.stringify(extension[extKeys[i]]));
                } else {
                    if (typeof base[extKeys[i]] === 'object' && typeof extension[extKeys[i]] === 'object') {
                        concat[extKeys[i]] = jsonConcat(base[extKeys[i]], extension[extKeys[i]]);
                    } else { //either from value to object or object from value we go with the extension
                        concat[extKeys[i]] = JSON.parse(JSON.stringify(extension[extKeys[i]]));
                    }
                }
            }
            return concat;
        }

        //FIXME are we going to use this function
        //function getConflictByGuid(conflict, guid) {
        //    var relids, i, result;
        //    if (conflict.guid === guid) {
        //        return conflict;
        //    }
        //    relids = getDiffChildrenRelids(conflict);
        //    for (i = 0; i < relids.length; i++) {
        //        result = getConflictByGuid(conflict[relids[i]], guid);
        //        if (result) {
        //            return result;
        //        }
        //    }
        //    return null;
        //}

        function getPathByGuid(conflict, guid, path) {
            var relids, i, result;
            if (conflict.guid === guid) {
                return path;
            }
            relids = getDiffChildrenRelids(conflict);
            for (i = 0; i < relids.length; i++) {
                result = getPathByGuid(conflict[relids[i]], guid, path + '/' + relids[i]);
                if (result) {
                    return result;
                }
            }
            return null;
        }

        //now we try a different approach, which maybe more simple
        function getCommonPathForConcat(path) {
            if (_concatMoves.getExtensionSourceFromDestination[path]) {
                path = _concatMoves.getExtensionSourceFromDestination[path];
            }
            if (_concatMoves.getBaseDestinationFromSource[path]) {
                path = _concatMoves.getBaseDestinationFromSource[path];
            }
            return path;
        }

        function getConcatBaseRemovals(diff) {
            var relids = getDiffChildrenRelids(diff),
                i;
            if (diff.removed !== true) {
                if (diff.movedFrom) {
                    if (_concatBaseRemovals[diff.guid] !== undefined) {
                        delete _concatBaseRemovals[diff.guid];
                    } else {
                        _concatBaseRemovals[diff.guid] = false;
                    }
                }
                for (i = 0; i < relids.length; i++) {
                    getConcatBaseRemovals(diff[relids[i]]);
                }
            } else {
                if (_concatBaseRemovals[diff.guid] === false) {
                    delete _concatBaseRemovals[diff.guid];
                } else {
                    _concatBaseRemovals[diff.guid] = true;
                }
            }
        }

        function getObstructiveGuids(diffNode) {
            var result = [],
                keys, i;
            keys = Object.keys(diffNode.oGuids || {});
            for (i = 0; i < keys.length; i++) {
                if (_concatBaseRemovals[keys[i]]) {
                    result.push(keys[i]);
                }
            }
            keys = Object.keys(diffNode.ooGuids || {});
            for (i = 0; i < keys.length; i++) {
                if (_concatBaseRemovals[keys[i]]) {
                    result.push(keys[i]);
                }
            }
            return result;
        }

        function getWhomIObstructGuids(guid) {
            //this function is needed when the extension contains a deletion where the base did not delete the node
            var guids = [],
                checkNode = function (diffNode) {
                    var relids, i;
                    if ((diffNode.oGuids && diffNode.oGuids[guid]) || (diffNode.ooGuids && diffNode.ooGuids[guid])) {
                        guids.push(diffNode.guid);
                    }

                    relids = getDiffChildrenRelids(diffNode);
                    for (i = 0; i < relids.length; i++) {
                        checkNode(diffNode[relids[i]]);
                    }
                };
            checkNode(_concatBase);
            return guids;
        }

        function gatherFullNodeConflicts(diffNode, mine, path, opposingPath) {
            var conflict,
                opposingConflict,
                keys, i,
                createSingleKeyValuePairConflicts = function (pathBase, data) {
                    var keys, i;
                    keys = Object.keys(data);
                    for (i = 0; i < keys.length; i++) {
                        conflict[pathBase + '/' + keys[i]] = conflict[pathBase + '/' + keys[i]] || {
                                value: data[keys[i]],
                                conflictingPaths: {}
                            };
                        conflict[pathBase + '/' + keys[i]].conflictingPaths[opposingPath] = true;
                        opposingConflict.conflictingPaths[pathBase + '/' + keys[i]] = true;
                    }
                };

            //setting the conflicts
            if (mine === true) {
                conflict = _conflictMine;
                opposingConflict = _conflictTheirs[opposingPath];
            } else {
                conflict = _conflictTheirs;
                opposingConflict = _conflictMine[opposingPath];
            }
            ASSERT(opposingConflict);
            //if the node was moved we should make a conflict for the whole node as well
            if (diffNode.movedFrom) {
                conflict[path] = conflict[path] || {value: path, conflictingPaths: {}};
                conflict[path].conflictingPaths[opposingPath] = true;
                opposingConflict.conflictingPaths[path] = true;
            }
            createSingleKeyValuePairConflicts(path + '/attr', diffNode.attr || {});
            createSingleKeyValuePairConflicts(path + '/reg', diffNode.reg || {});
            createSingleKeyValuePairConflicts(path + '/pointer', diffNode.pointer || {});

            if (diffNode.set) {
                if (diffNode.set === TODELETESTRING) {
                    conflict[path + '/set'] = conflict[path + '/set'] || {value: TODELETESTRING, conflictingPaths: {}};
                    conflict[path + '/set'].conflictingPaths[opposingPath] = true;
                    opposingConflict.conflictingPaths[path + '/set'] = true;
                } else {
                    keys = Object.keys(diffNode.set);
                    for (i = 0; i < keys.length; i++) {
                        if (diffNode.set[keys[i]] === TODELETESTRING) {
                            conflict[path + '/set/' + keys[i]] = conflict[path + '/set/' + keys[i]] || {
                                    value: TODELETESTRING,
                                    conflictingPaths: {}
                                };
                            conflict[path + '/set/' + keys[i]].conflictingPaths[opposingPath] = true;
                            opposingConflict.conflictingPaths[path + '/set/' + keys[i]] = true;
                        } else {
                            gatherFullSetConflicts(diffNode.set[keys[i]], mine, path + '/set/' + keys[i], opposingPath);
                        }
                    }
                }
            }

            if (diffNode.meta) {
                gatherFullMetaConflicts(diffNode.meta, mine, path + '/meta', opposingPath);
            }

            //if the opposing item is theirs, we have to recursively go down in our changes
            if (mine) {
                keys = getDiffChildrenRelids(diffNode);
                for (i = 0; i < keys.length; i++) {
                    gatherFullNodeConflicts(diffNode[keys[i]], true, path + '/' + keys[i], opposingPath);
                }
            }

        }

        function gatherFullSetConflicts(diffSet, mine, path, opposingPath) {
            var relids = getDiffChildrenRelids(diffSet),
                i, keys, j, conflict, opposingConflict;

            //setting the conflicts
            if (mine === true) {
                conflict = _conflictMine;
                opposingConflict = _conflictTheirs[opposingPath];
            } else {
                conflict = _conflictTheirs;
                opposingConflict = _conflictMine[opposingPath];
            }
            for (i = 0; i < relids.length; i++) {
                if (diffSet[relids[i]] === TODELETESTRING) {
                    //single conflict as the element was removed
                    conflict[path + '/' + relids[i] + '/'] = conflict[path + '/' + relids[i] + '/'] || {
                            value: TODELETESTRING,
                            conflictingPaths: {}
                        };
                    conflict[path + '/' + relids[i] + '/'].conflictingPaths[opposingPath] = true;
                    opposingConflict.conflictingPaths[path + '/' + relids[i] + '/'] = true;
                } else {
                    keys = Object.keys(diffSet[relids[i]].attr || {});
                    for (j = 0; j < keys.length; j++) {
                        conflict[path + '/' + relids[i] + '//attr/' + keys[j]] =
                            conflict[path + '/' + relids[i] + '//attr/' + keys[j]] || {
                                value: diffSet[relids[i]].attr[keys[j]],
                                conflictingPaths: {}
                            };
                        conflict[path + '/' + relids[i] + '//attr/' + keys[j]].conflictingPaths[opposingPath] = true;
                        opposingConflict.conflictingPaths[path + '/' + relids[i] + '//attr/' + keys[j]] = true;
                    }
                    keys = Object.keys(diffSet[relids[i]].reg || {});
                    for (j = 0; j < keys.length; j++) {
                        conflict[path + '/' + relids[i] + '//reg/' + keys[j]] =
                            conflict[path + '/' + relids[i] + '//reg/' + keys[j]] || {
                                value: diffSet[relids[i]].reg[keys[j]],
                                conflictingPaths: {}
                            };
                        conflict[path + '/' + relids[i] + '//reg/' + keys[j]].conflictingPaths[opposingPath] = true;
                        opposingConflict.conflictingPaths[path + '/' + relids[i] + '//reg/' + keys[j]] = true;
                    }
                }
            }
        }

        function concatSingleKeyValuePairs(path, base, extension) {
            var keys, i, temp;
            keys = Object.keys(extension);
            for (i = 0; i < keys.length; i++) {
                temp = extension[keys[i]];
                if (typeof temp === 'string' && temp !== TODELETESTRING) {
                    temp = getCommonPathForConcat(temp);
                }
                if (base[keys[i]] && CANON.stringify(base[keys[i]]) !== CANON.stringify(temp)) {
                    //conflict
                    _conflictMine[path + '/' + keys[i]] = {value: base[keys[i]], conflictingPaths: {}};
                    _conflictTheirs[path + '/' + keys[i]] = {value: extension[keys[i]], conflictingPaths: {}};
                    _conflictMine[path + '/' + keys[i]].conflictingPaths[path + '/' + keys[i]] = true;
                    _conflictTheirs[path + '/' + keys[i]].conflictingPaths[path + '/' + keys[i]] = true;
                } else {
                    base[keys[i]] = extension[keys[i]];
                }
            }
        }

        function concatSet(path, base, extension) {
            var names = Object.keys(extension),
                members, i, j, memberPath;

            for (i = 0; i < names.length; i++) {
                if (base[names[i]]) {
                    if (base[names[i]] === TODELETESTRING) {
                        if (extension[names[i]] !== TODELETESTRING) {
                            //whole set conflict
                            _conflictMine[path + '/' + names[i]] = {value: TODELETESTRING, conflictingPaths: {}};
                            gatherFullSetConflicts(extension[names[i]],
                                false, path + '/' + names[i], path + '/' + names[i]);
                        }
                    } else {
                        if (extension[names[i]] === TODELETESTRING) {
                            //whole set conflict
                            _conflictTheirs[path + '/' + names[i]] = {value: TODELETESTRING, conflictingPaths: {}};
                            gatherFullSetConflicts(base[names[i]], true, path + '/' + names[i], path + '/' + names[i]);
                        } else {
                            //now we can only have member or sub-member conflicts...
                            members = getDiffChildrenRelids(extension[names[i]]);
                            for (j = 0; j < members.length; j++) {
                                memberPath = getCommonPathForConcat(members[j]);
                                if (base[names[i]][memberPath]) {
                                    if (base[names[i]][memberPath] === TODELETESTRING) {
                                        if (extension[names[i]][members[j]] !== TODELETESTRING) {
                                            //whole member conflict
                                            _conflictMine[path + '/' + names[i] + '/' + memberPath + '//'] = {
                                                value: TODELETESTRING,
                                                conflictingPaths: {}
                                            };
                                            gatherFullNodeConflicts(extension[names[i]][members[j]],
                                                false,
                                                path + '/' + names[i] + '/' + memberPath + '//', path +
                                                '/' + names[i] + '/' + memberPath + '//');
                                        }
                                    } else {
                                        if (extension[names[i]][members[j]] === TODELETESTRING) {
                                            //whole member conflict
                                            _conflictTheirs[path + '/' + names[i] + '/' + memberPath + '//'] = {
                                                value: TODELETESTRING,
                                                conflictingPaths: {}
                                            };
                                            gatherFullNodeConflicts(base[names[i]][memberPath],
                                                true,
                                                path + '/' + names[i] + '/' + memberPath + '//', path +
                                                '/' + names[i] + '/' + memberPath + '//');
                                        } else {
                                            if (extension[names[i]][members[j]].attr) {
                                                if (base[names[i]][memberPath].attr) {
                                                    concatSingleKeyValuePairs(path + '/' +
                                                        names[i] + '/' + memberPath + '/' + '/attr',
                                                        base[names[i]][memberPath].attr,
                                                        extension[names[i]][members[j]].attr);
                                                } else {
                                                    base[names[i]][memberPath].attr =
                                                        extension[names[i]][members[j]].attr;
                                                }
                                            }
                                            if (extension[names[i]][members[j]].reg) {
                                                if (base[names[i]][memberPath].reg) {
                                                    concatSingleKeyValuePairs(path + '/' +
                                                        names[i] + '/' + memberPath + '/' + '/reg',
                                                        base[names[i]][memberPath].reg,
                                                        extension[names[i]][members[j]].reg);
                                                } else {
                                                    base[names[i]][memberPath].reg =
                                                        extension[names[i]][members[j]].reg;
                                                }
                                            }

                                        }
                                    }
                                } else {
                                    //concat
                                    base[names[i]][memberPath] = extension[names[i]][members[j]];
                                }
                            }
                        }
                    }
                } else {
                    //simple concatenation
                    //TODO the path for members should be replaced here as well...
                    base[names[i]] = extension[names[i]];
                }
            }
        }

        function gatherFullMetaConflicts(diffMeta, mine, path, opposingPath) {
            var conflict, opposingConflict,
                relids, i, j, keys, tPath;

            if (mine) {
                conflict = _conflictMine;
                opposingConflict = _conflictTheirs[opposingPath];
            } else {
                conflict = _conflictTheirs;
                opposingConflict = _conflictMine[opposingPath];
            }

            if (diffMeta === TODELETESTRING) {
                conflict[path] = conflict[path] || {value: TODELETESTRING, conflictingPaths: {}};
                conflict[path].conflictingPaths[opposingPath] = true;
                opposingConflict.conflictingPaths[path] = true;
                return; //there is no other conflict
            }

            //children
            if (diffMeta.children) {
                if (diffMeta.children === TODELETESTRING) {
                    conflict[path + '/children'] = conflict[path + '/children'] || {
                            value: TODELETESTRING,
                            conflictingPaths: {}
                        };
                    conflict[path + '/children'].conflictingPaths[opposingPath] = true;
                    opposingConflict.conflictingPaths[path + '/children'] = true;
                } else {
                    if (diffMeta.children.max) {
                        conflict[path + '/children/max'] = conflict[path + '/children/max'] || {
                                value: diffMeta.children.max,
                                conflictingPaths: {}
                            };
                        conflict[path + '/children/max'].conflictingPaths[opposingPath] = true;
                        opposingConflict.conflictingPaths[path + '/children/max'] = true;
                    }
                    if (diffMeta.children.min) {
                        conflict[path + '/children/min'] = conflict[path + '/children/min'] || {
                                value: diffMeta.children.min,
                                conflictingPaths: {}
                            };
                        conflict[path + '/children/min'].conflictingPaths[opposingPath] = true;
                        opposingConflict.conflictingPaths[path + '/children/min'] = true;
                    }
                    relids = getDiffChildrenRelids(diffMeta.children);
                    for (i = 0; i < relids.length; i++) {
                        conflict[path + '/children/' + relids[i]] = conflict[path + '/children/' + relids[i]] || {
                                value: diffMeta.children[relids[i]],
                                conflictingPaths: {}
                            };
                        conflict[path + '/children/' + relids[i]].conflictingPaths[opposingPath] = true;
                        opposingConflict.conflictingPaths[path + '/children/' + relids[i]] = true;
                    }
                }
            }
            //attributes
            if (diffMeta.attributes) {
                if (diffMeta.attributes === TODELETESTRING) {
                    conflict[path + '/attributes'] = conflict[path + '/attributes'] || {
                            value: TODELETESTRING,
                            conflictingPaths: {}
                        };
                    conflict[path + '/attributes'].conflictingPaths[opposingPath] = true;
                    opposingConflict.conflictingPaths[path + '/attributes'] = true;
                } else {
                    keys = Object.keys(diffMeta.attributes);
                    for (i = 0; i < keys.length; i++) {
                        conflict[path + '/attributes/' + keys[i]] = conflict[path + '/attributes/' + keys[i]] || {
                                value: diffMeta.attributes[keys[i]],
                                conflictingPaths: {}
                            };
                        conflict[path + '/attributes'].conflictingPaths[opposingPath] = true;
                        opposingConflict.conflictingPaths[path + '/attributes'] = true;
                    }
                }
            }
            //pointers
            if (diffMeta.pointers) {
                if (diffMeta.pointers === TODELETESTRING) {
                    conflict[path + '/pointers'] = conflict[path + '/pointers'] || {
                            value: TODELETESTRING,
                            conflictingPaths: {}
                        };
                    conflict[path + '/pointers'].conflictingPaths[opposingPath] = true;
                    opposingConflict.conflictingPaths[path + '/pointers'] = true;
                } else {
                    keys = Object.keys(diffMeta.pointers);
                    for (i = 0; i < keys.length; i++) {
                        if (diffMeta.pointers[keys[i]] === TODELETESTRING) {
                            conflict[path + '/pointers/' + keys[i]] = conflict[path + '/pointers/' + keys[i]] || {
                                    value: TODELETESTRING,
                                    conflictingPaths: {}
                                };
                            conflict[path + '/pointers/' + keys[i]].conflictingPaths[opposingPath] = true;
                            opposingConflict.conflictingPaths[path + '/pointers/' + keys[i]] = true;
                        } else {
                            if (diffMeta.pointers[keys[i]].max) {
                                conflict[path + '/pointers/' + keys[i] + '/max'] =
                                    conflict[path + '/pointers/' + keys[i] + '/max'] || {
                                        value: diffMeta.pointers[keys[i]].max,
                                        conflictingPaths: {}
                                    };
                                conflict[path + '/pointers/' + keys[i] + '/max'].conflictingPaths[opposingPath] = true;
                                opposingConflict.conflictingPaths[path + '/pointers/' + keys[i] + '/max'] = true;
                            }
                            if (diffMeta.pointers[keys[i]].min) {
                                conflict[path + '/pointers/' + keys[i] + '/min'] =
                                    conflict[path + '/pointers/' + keys[i] + '/min'] || {
                                        value: diffMeta.pointers[keys[i]].min,
                                        conflictingPaths: {}
                                    };
                                conflict[path + '/pointers/' + keys[i] + '/min'].conflictingPaths[opposingPath] = true;
                                opposingConflict.conflictingPaths[path + '/pointers/' + keys[i] + '/min'] = true;
                            }
                            relids = getDiffChildrenRelids(diffMeta.pointers[keys[i]]);
                            for (j = 0; j < relids.length; j++) {
                                tPath = getCommonPathForConcat(relids[j]);
                                conflict[path + '/pointers/' + keys[i] + '/' + tPath + '//'] =
                                    conflict[path + '/pointers/' + keys[i] + '/' + tPath + '//'] || {
                                        value: diffMeta.pointers[keys[i]][relids[j]],
                                        conflictingPaths: {}
                                    };
                                conflict[path + '/pointers/' + keys[i] + '/' + tPath + '//'].
                                    conflictingPaths[opposingPath] = true;
                                opposingConflict.
                                    conflictingPaths[path + '/pointers/' + keys[i] + '/' + tPath + '//'] = true;
                            }
                        }
                    }
                }
            }
            //aspects
            //TODO
        }

        function concatMeta(path, base, extension) {
            var keys, i, tPath, j, paths, t2Path,
                mergeMetaItems = function (bPath, bData, eData) {
                    var bKeys, tKeys, i, tPath, t2Path;
                    //delete checks
                    if (bData === TODELETESTRING || eData === TODELETESTRING) {
                        if (CANON.stringify(bData) !== CANON.stringify(eData)) {
                            _conflictMine[bPath] = _conflictMine[bPath] || {value: bData, conflictingPaths: {}};
                            _conflictMine[bPath].conflictingPaths[bPath] = true;
                            _conflictTheirs[bPath] = _conflictTheirs[bPath] || {value: eData, conflictingPaths: {}};
                            _conflictTheirs[bPath].conflictingPaths[bPath] = true;
                        }
                    } else {
                        //max
                        if (eData.max) {
                            if (bData.max && bData.max !== eData.max) {
                                tPath = bPath + '/max';
                                _conflictMine[tPath] = _conflictMine[tPath] || {
                                        value: bData.max,
                                        conflictingPaths: {}
                                    };
                                _conflictMine[tPath].conflictingPaths[tPath] = true;
                                _conflictTheirs[tPath] = _conflictTheirs[tPath] || {
                                        value: eData.max,
                                        conflictingPaths: {}
                                    };
                                _conflictTheirs[tPath].conflictingPaths[tPath] = true;
                            } else {
                                bData.max = eData.max;
                            }
                        }
                        //min
                        if (eData.min) {
                            if (bData.min && bData.min !== eData.min) {
                                tPath = bPath + '/min';
                                _conflictMine[tPath] = _conflictMine[tPath] || {
                                        value: bData.min,
                                        conflictingPaths: {}
                                    };
                                _conflictMine[tPath].conflictingPaths[tPath] = true;
                                _conflictTheirs[tPath] = _conflictTheirs[tPath] || {
                                        value: eData.min,
                                        conflictingPaths: {}
                                    };
                                _conflictTheirs[tPath].conflictingPaths[tPath] = true;
                            } else {
                                bData.max = eData.min;
                            }
                        }
                        //targets
                        bKeys = getDiffChildrenRelids(bData);
                        tKeys = getDiffChildrenRelids(eData);
                        for (i = 0; i < tKeys.length; i++) {
                            tPath = getCommonPathForConcat(tKeys[i]);
                            if (bKeys.indexOf(tPath) !== -1 && CANON.stringify(bData[tPath]) !==
                                CANON.stringify(eData[tKeys[i]])) {

                                t2Path = tPath;
                                tPath = bPath + '/' + tPath + '//';
                                _conflictMine[tPath] = _conflictMine[tPath] || {
                                        value: bData[t2Path],
                                        conflictingPaths: {}
                                    };
                                _conflictMine[tPath].conflictingPaths[tPath] = true;
                                _conflictTheirs[tPath] = _conflictTheirs[tPath] || {
                                        value: eData[tKeys[i]],
                                        conflictingPaths: {}
                                    };
                                _conflictTheirs[tPath].conflictingPaths[tPath] = true;
                            } else {
                                bData[tPath] = eData[tKeys[i]];
                            }
                        }
                    }
                };
            if (CANON.stringify(base) !== CANON.stringify(extension)) {
                if (base === TODELETESTRING) {
                    _conflictMine[path] = _conflictMine[path] || {value: TODELETESTRING, conflictingPaths: {}};
                    gatherFullMetaConflicts(extension, false, path, path);
                } else {
                    if (extension === TODELETESTRING) {
                        _conflictTheirs[path] = _conflictTheirs[path] || {
                                value: TODELETESTRING,
                                conflictingPaths: {}
                            };
                        gatherFullMetaConflicts(base, true, path, path);
                    } else {
                        //now check for sub-meta conflicts

                        //children
                        if (extension.children) {
                            if (base.children) {
                                mergeMetaItems(path + '/children', base.children, extension.children);
                            } else {
                                //we just simply merge the extension's
                                base.children = extension.children;
                            }
                        }
                        //pointers
                        if (extension.pointers) {
                            if (base.pointers) {
                                //complete deletion
                                if (base.pointers === TODELETESTRING || extension.pointers === TODELETESTRING) {
                                    if (CANON.stringify(base.pointers) !== CANON.stringify(extension.pointers)) {
                                        tPath = path + '/pointers';
                                        _conflictMine[tPath] = _conflictMine[tPath] || {
                                                value: base.pointers,
                                                conflictingPaths: {}
                                            };
                                        _conflictMine[tPath].conflictingPaths[tPath] = true;
                                        _conflictTheirs[tPath] = _conflictTheirs[tPath] || {
                                                value: extension.pointers,
                                                conflictingPaths: {}
                                            };
                                        _conflictTheirs[tPath].conflictingPaths[tPath] = true;
                                    }
                                } else {
                                    keys = Object.keys(extension.pointers);
                                    for (i = 0; i < keys.length; i++) {
                                        if (base.pointers[keys[i]]) {
                                            mergeMetaItems(path + '/pointers/' + keys[i], base.pointers[keys[i]],
                                                extension.pointers[keys[i]]);
                                        } else {
                                            base.pointers[keys[i]] = extension.pointers[keys[i]];
                                        }
                                    }
                                }
                            } else {
                                base.pointers = extension.pointers;
                            }
                        }
                        //attributes
                        if (extension.attributes) {
                            if (base.attributes) {
                                if (extension.attributes === TODELETESTRING || base.attributes === TODELETESTRING) {
                                    if (CANON.stringify(base.attributes) !== CANON.stringify(extension.attributes)) {
                                        tPath = path + '/attributes';
                                        _conflictMine[tPath] = _conflictMine[tPath] || {
                                                value: base.attributes,
                                                conflictingPaths: {}
                                            };
                                        _conflictMine[tPath].conflictingPaths[tPath] = true;
                                        _conflictTheirs[tPath] = _conflictTheirs[tPath] || {
                                                value: extension.attributes,
                                                conflictingPaths: {}
                                            };
                                        _conflictTheirs[tPath].conflictingPaths[tPath] = true;
                                    }
                                } else {
                                    keys = Object.keys(extension.attributes);
                                    for (i = 0; i < keys.length; i++) {
                                        if (base.attributes[keys[i]]) {
                                            if (extension.attributes[keys[i]] === TODELETESTRING ||
                                                base.attributes[keys[i]] === TODELETESTRING) {

                                                if (CANON.stringify(base.attributes[keys[i]]) !==
                                                    CANON.stringify(extension.attributes[keys[i]])) {

                                                    tPath = path + '/attributes/' + [keys[i]];
                                                    _conflictMine[tPath] = _conflictMine[tPath] || {
                                                            value: base.attributes[keys[i]],
                                                            conflictingPaths: {}
                                                        };
                                                    _conflictMine[tPath].conflictingPaths[tPath] = true;
                                                    _conflictTheirs[tPath] = _conflictTheirs[tPath] || {
                                                            value: extension.attributes[keys[i]],
                                                            conflictingPaths: {}
                                                        };
                                                    _conflictTheirs[tPath].conflictingPaths[tPath] = true;
                                                }
                                            } else {
                                                concatSingleKeyValuePairs(path + '/attributes/' + keys[i],
                                                    base.attributes[keys[i]], extension.attributes[keys[i]]);
                                            }
                                        } else {
                                            base.attributes[keys[i]] = extension.attributes[keys[i]];
                                        }
                                    }

                                }
                            } else {
                                base.attributes = extension.attributes;
                            }
                        }

                        //aspects
                        if (extension.aspects) {
                            if (base.aspects) {
                                if (extension.aspects === TODELETESTRING || base.aspects === TODELETESTRING) {
                                    if (CANON.stringify(base.aspects) !== CANON.stringify(extension.aspects)) {
                                        tPath = path + '/aspects';
                                        _conflictMine[tPath] = _conflictMine[tPath] || {
                                                value: base.aspects,
                                                conflictingPaths: {}
                                            };
                                        _conflictMine[tPath].conflictingPaths[tPath] = true;
                                        _conflictTheirs[tPath] = _conflictTheirs[tPath] || {
                                                value: extension.aspects,
                                                conflictingPaths: {}
                                            };
                                        _conflictTheirs[tPath].conflictingPaths[tPath] = true;
                                    }
                                } else {
                                    keys = Object.keys(extension.aspects);
                                    for (i = 0; i < keys.length; i++) {
                                        if (base.aspects[keys[i]]) {
                                            if (extension.aspects[keys[i]] === TODELETESTRING ||
                                                base.aspects[keys[i]] === TODELETESTRING) {
                                                if (CANON.stringify(base.aspects[keys[i]]) !==
                                                    CANON.stringify(extension.aspects[keys[i]])) {
                                                    tPath = path + '/aspects/' + keys[i];
                                                    _conflictMine[tPath] = _conflictMine[tPath] || {
                                                            value: base.aspects[keys[i]],
                                                            conflictingPaths: {}
                                                        };
                                                    _conflictMine[tPath].conflictingPaths[tPath] = true;
                                                    _conflictTheirs[tPath] = _conflictTheirs[tPath] || {
                                                            value: extension.aspects[keys[i]],
                                                            conflictingPaths: {}
                                                        };
                                                    _conflictTheirs[tPath].conflictingPaths[tPath] = true;
                                                }
                                            } else {
                                                paths = Object.keys(extension.aspects[keys[i]]);
                                                for (j = 0; j < paths.length; j++) {
                                                    tPath = getCommonPathForConcat(paths[j]);
                                                    if (base.aspects[keys[i]][tPath]) {
                                                        if (CANON.stringify(base.aspects[keys[i]][tPath]) !==
                                                            CANON.stringify(extension.aspects[keys[i]][paths[j]])) {
                                                            t2Path = tPath;
                                                            tPath = path + '/aspects/' + keys[i] + '/' + tPath + '//';
                                                            _conflictMine[tPath] = _conflictMine[tPath] || {
                                                                    value: base.aspects[keys[i]][t2Path],
                                                                    conflictingPaths: {}
                                                                };
                                                            _conflictMine[tPath].conflictingPaths[tPath] = true;
                                                            _conflictTheirs[tPath] = _conflictTheirs[tPath] || {
                                                                    value: extension.aspects[keys[i]][paths[j]],
                                                                    conflictingPaths: {}
                                                                };
                                                            _conflictTheirs[tPath].conflictingPaths[tPath] = true;
                                                        }
                                                    } else {
                                                        base.aspects[keys[i]][tPath] =
                                                            extension.aspects[keys[i]][paths[j]];
                                                    }
                                                }
                                            }
                                        } else {
                                            base.aspects[keys[i]] = extension.aspects[keys[i]];
                                        }
                                    }
                                }
                            } else {
                                base.aspects = extension.aspects;
                            }
                        }
                    }
                }
            }
        }

        function tryToConcatNodeChange(extNode, path) {
            var guid = extNode.guid,
                oGuids = getObstructiveGuids(extNode),
                baseNode = getNodeByGuid(_concatBase, guid),
                basePath = getPathByGuid(_concatBase, guid, ''),
                i, tPath,
                relids = getDiffChildrenRelids(extNode);


            if (extNode.removed === true) {
                if (baseNode && baseNode.removed !== true) {
                    tPath = basePath + '/removed';
                    _conflictTheirs[tPath] = _conflictTheirs[tPath] || {value: true, conflictingPaths: {}};
                    oGuids = getWhomIObstructGuids(guid);
                    ASSERT(oGuids.length > 0);
                    for (i = 0; i < oGuids.length; i++) {
                        baseNode = getNodeByGuid(_concatBase, oGuids[i]);
                        basePath = getPathByGuid(_concatBase, oGuids[i], '');
                        gatherFullNodeConflicts(baseNode, true, basePath, tPath);
                    }
                } else {
                    //we simply concat the deletion
                    insertAtPath(_concatBase, path, extNode);
                }
            } else {
                if (oGuids.length > 0) {
                    for (i = 0; i < oGuids.length; i++) {
                        baseNode = getNodeByGuid(_concatBase, oGuids[i]);
                        basePath = getPathByGuid(_concatBase, oGuids[i], '');
                        _conflictMine[basePath + '/removed'] = _conflictMine[basePath + '/removed'] || {
                                value: true,
                                conflictingPaths: {}
                            };
                        gatherFullNodeConflicts(extNode, false, path, basePath + '/removed');
                    }
                } else if (baseNode) {
                    //here we are able to check the sub-node conflicts
                    //check double moves - we do not care if they moved under the same parent
                    if (extNode.movedFrom) {
                        if (baseNode.movedFrom && path !== basePath) {
                            _conflictMine[basePath] = _conflictMine[basePath] || {
                                    value: 'move',
                                    conflictingPaths: {}
                                };
                            _conflictTheirs[path] = _conflictTheirs[path] || {value: 'move', conflictingPaths: {}};
                            _conflictMine[basePath].conflictingPaths[path] = true;
                            _conflictTheirs[path].conflictingPaths[basePath] = true;
                            //we keep the node where it is, but synchronize the paths
                            path = basePath;
                        } else if (path !== basePath) {
                            //first we move the base object to its new path
                            //we copy the moved from information right here
                            baseNode.movedFrom = extNode.movedFrom;
                            insertAtPath(_concatBase, path, baseNode);
                            removePathFromDiff(_concatBase, basePath);
                            baseNode = getNodeByGuid(_concatBase, guid);
                            basePath = getPathByGuid(_concatBase, guid, '');
                            ASSERT(path === basePath);
                        }
                    }

                    ASSERT(basePath === path || baseNode.movedFrom === path);
                    path = basePath; //the base was moved


                    //and now the sub-node conflicts
                    if (extNode.attr) {
                        if (baseNode.attr) {
                            concatSingleKeyValuePairs(path + '/attr', baseNode.attr, extNode.attr);
                        } else {
                            insertAtPath(_concatBase, path + '/attr', extNode.attr);
                        }
                    }
                    if (extNode.reg) {
                        if (baseNode.reg) {
                            concatSingleKeyValuePairs(path + '/reg', baseNode.reg, extNode.reg);
                        } else {
                            insertAtPath(_concatBase, path + '/reg', extNode.reg);
                        }
                    }
                    if (extNode.pointer) {
                        if (baseNode.pointer) {
                            concatSingleKeyValuePairs(path + '/pointer', baseNode.pointer, extNode.pointer);
                        } else {
                            insertAtPath(_concatBase, path + '/pointer', extNode.pointer);
                        }
                    }
                    if (extNode.set) {
                        if (baseNode.set) {
                            concatSet(path + '/set', baseNode.set, extNode.set);
                        } else {
                            insertAtPath(_concatBase, path + '/set', extNode.set);
                        }
                    }
                    if (extNode.meta) {
                        if (baseNode.meta) {
                            concatMeta(path + '/meta', baseNode.meta, extNode.meta);
                        } else {
                            insertAtPath(_concatBase, path + '/meta', extNode.meta);
                        }
                    }
                } else {
                    //there is no basenode so we can concat the whole node
                    insertAtPath(_concatBase, path, getSingleNode(extNode));
                }
            }

            //here comes the recursion
            for (i = 0; i < relids.length; i++) {
                tryToConcatNodeChange(extNode[relids[i]], path + '/' + relids[i]);
            }

        }

        function generateConflictItems() {
            var items = [],
                keys, i, j, conflicts;
            keys = Object.keys(_conflictMine);

            for (i = 0; i < keys.length; i++) {
                conflicts = Object.keys(_conflictMine[keys[i]].conflictingPaths || {});
                ASSERT(conflicts.length > 0);
                for (j = 0; j < conflicts.length; j++) {
                    items.push({
                        selected: 'mine',
                        mine: {
                            path: keys[i],
                            info: keys[i].replace(/\//g, ' / '),
                            value: _conflictMine[keys[i]].value
                        },
                        theirs: {
                            path: conflicts[j],
                            info: conflicts[j].replace(/\//g, ' / '),
                            value: _conflictTheirs[conflicts[j]].value
                        }
                    });
                }
            }
            return items;
        }

        function harmonizeConflictPaths(diff) {
            var relids = getDiffChildrenRelids(diff),
                keys, i, members, j;

            keys = Object.keys(diff.pointer || {});
            for (i = 0; i < keys.length; i++) {
                diff.pointer[keys[i]] = getCommonPathForConcat(diff.pointer[keys[i]]);
            }
            keys = Object.keys(diff.set || {});
            for (i = 0; i < keys.length; i++) {
                members = Object.keys(diff.set[keys[i]] || {});
                for (j = 0; j < members.length; j++) {
                    if (members[j] !== getCommonPathForConcat(members[j])) {
                        diff.set[keys[i]][getCommonPathForConcat(members[j])] = diff.set[keys[i]][members[j]];
                        delete diff.set[keys[i]][members[j]];
                    }
                }
            }

            //TODO we have to do the meta as well
            for (i = 0; i < relids.length; i++) {
                harmonizeConflictPaths(diff[relids[i]]);
            }
        }

        _core.tryToConcatChanges = function (base, extension) {
            var result = {};
            _conflictItems = [];
            _conflictMine = {};
            _conflictTheirs = {};
            _concatBase = base;
            _concatExtension = extension;
            _concatBaseRemovals = {};
            _concatMoves = {
                getBaseSourceFromDestination: {},
                getBaseDestinationFromSource: {},
                getExtensionSourceFromDestination: {},
                getExtensionDestinationFromSource: {}
            };
            getMoveSources(base,
                '', _concatMoves.getBaseSourceFromDestination, _concatMoves.getBaseDestinationFromSource);
            getMoveSources(extension,
                '', _concatMoves.getExtensionSourceFromDestination, _concatMoves.getExtensionDestinationFromSource);
            getConcatBaseRemovals(base);
            tryToConcatNodeChange(_concatExtension, '');

            result.items = generateConflictItems();
            result.mine = _conflictMine;
            result.theirs = _conflictTheirs;
            result.merge = _concatBase;
            harmonizeConflictPaths(result.merge);
            return result;
        };

        function depthOfPath(path) {
            ASSERT(typeof path === 'string');
            return path.split('/').length;
        }

        function resolveMoves(resolveObject) {
            var i, moves = {},
                filteredItems = [],
                path,
                moveBaseOfPath = function (path) {
                    var keys = Object.keys(moves),
                        i, maxDepth = -1,
                        base = null;
                    for (i = 0; i < keys.length; i++) {
                        if (path.indexOf(keys[i]) === 1 && depthOfPath(keys[i]) > maxDepth) {
                            base = keys[i];
                            maxDepth = depthOfPath(keys[i]);
                        }
                    }
                    return base;
                };
            for (i = 0; i < resolveObject.items.length; i++) {
                if (resolveObject.items[i].selected === 'theirs' && resolveObject.items[i].theirs.value === 'move') {
                    moves[resolveObject.items[i].mine.path] = resolveObject.items[i].theirs.path;
                    //and we also make the move
                    insertAtPath(resolveObject.merge,
                        resolveObject.items[i].theirs.path,
                        getPathOfDiff(resolveObject.merge, resolveObject.items[i].mine.path));
                    removePathFromDiff(resolveObject.merge, resolveObject.items[i].mine.path);
                } else {
                    filteredItems.push(resolveObject.items[i]);
                }
            }
            resolveObject.items = filteredItems;

            //in a second run we modify all sub-path of the moves paths
            for (i = 0; i < resolveObject.items.length; i++) {
                if (resolveObject.items[i].selected === 'theirs') {
                    path = moveBaseOfPath(resolveObject.items[i].theirs.path);
                    if (path) {
                        resolveObject.items[i].theirs.path =
                            resolveObject.items[i].theirs.path.replace(path, moves[path]);
                    }
                    path = moveBaseOfPath(resolveObject.items[i].mine.path);
                    if (path) {
                        resolveObject.items[i].mine.path = resolveObject.items[i].mine.path.replace(path, moves[path]);
                    }
                }
            }
        }

        _core.applyResolution = function (conflictObject) {
            //we apply conflict items to the merge and return it as a diff
            var i;
            resolveMoves(conflictObject);
            for (i = 0; i < conflictObject.items.length; i++) {
                if (conflictObject.items[i].selected !== 'mine') {
                    removePathFromDiff(conflictObject.merge, conflictObject.items[i].mine.path);
                    insertAtPath(conflictObject.merge,
                        conflictObject.items[i].theirs.path, conflictObject.items[i].theirs.value);
                }
            }

            return conflictObject.merge;
        };


        //we remove some low level functions as they should not be used on high level
        delete _core.overlayInsert;

        return _core;
    }

    return diffCore;
});

/*globals define*/
/*jshint node: true, browser: true*/

/**
 * @author kecso / https://github.com/kecso
 */

define('common/core/core',[
    'common/core/corerel',
    'common/core/setcore',
    'common/core/guidcore',
    'common/core/nullpointercore',
    'common/core/coreunwrap',
    'common/core/coretype',
    'common/core/constraintcore',
    'common/core/coretree',
    'common/core/metacore',
    'common/core/coretreeloader',
    'common/core/corediff'
], function (CoreRel, Set, Guid, NullPtr, UnWrap, Type, Constraint, CoreTree, MetaCore, TreeLoader, CoreDiff) {
    

    function Core(storage, options) {
        var core,
            coreLayers = [];
        coreLayers.push(CoreRel);
        coreLayers.push(NullPtr);
        coreLayers.push(Type);
        coreLayers.push(NullPtr);
        coreLayers.push(Set);
        coreLayers.push(Guid);
        coreLayers.push(Constraint);
        coreLayers.push(MetaCore);
        coreLayers.push(CoreDiff);
        coreLayers.push(TreeLoader);
        if (options.usertype !== 'tasync') {
            coreLayers.push(UnWrap);
        }

        core = coreLayers.reduce(function (inner, Class) {
            return new Class(inner, options);
        }, new CoreTree(storage, options));

        return core;
    }

    return Core;
});

/*globals define*/
/*jshint browser:true*/

/**
 * @author pmeijer / https://github.com/pmeijer
 */

define('js/client/constants',['common/storage/constants'], function (STORAGE_CONSTANTS) {
    

    return {

        STORAGE: STORAGE_CONSTANTS,

        BRANCH_STATUS: {
            SYNC: 'SYNC',
            AHEAD_SYNC: 'AHEAD_SYNC',
            AHEAD_NOT_SYNC: 'AHEAD_NOT_SYNC',
            PULLING: 'PULLING'
        },

        // Events
        NETWORK_STATUS_CHANGED: 'NETWORK_STATUS_CHANGED',
        BRANCH_STATUS_CHANGED: 'BRANCH_STATUS_CHANGED',

        BRANCH_CHANGED: 'BRANCH_CHANGED',
        PROJECT_CLOSED: 'PROJECT_CLOSED',
        PROJECT_OPENED: 'PROJECT_OPENED',

        UNDO_AVAILABLE: 'UNDO_AVAILABLE',
        REDO_AVAILABLE: 'REDO_AVAILABLE'
    };
});
/*globals define*/
/*jshint node: true, browser: true*/

/**
 * @author kecso / https://github.com/kecso
 */

define('common/core/users/meta',[], function () {
    

    function metaStorage() {
        var _core = null,
            _nodes = null,
            _save = function () {
            },
            _initialized = false;

        function initialize(core, nodes, save) {
            _core = core;
            _nodes = nodes;
            _save = save;
            _initialized = true;
        }

        function isValidMeta(/*meta*/) {
            /*if( typeof meta === 'object'){
             if(
             //children
             typeof meta.children === 'object' &&
             (meta.children.types === null || typeof meta.children.types === 'array') &&
             (typeof meta.children.min === 'undefined' || typeof meta.children.min === 'number') &&
             (typeof meta.children.max === 'undefined' || typeof meta.children.max === 'number')){

             //attributes
             }
             }

             return false;*/
            //TODO implement it :)
            return true;
        }

        //function isValidAttributeSchema(atrSchema) {
        //    //TODO implement :)
        //    return true;
        //}

        //TODO this may change
        function pathToRefObject(path) {
            var ref = {};
            ref.$ref = path;
            return ref;
        }

        //TODO this may change
        function refObjectToPath(ref) {
            if (typeof ref.$ref === 'string') {
                return ref.$ref/*.substring(1)*/;
            } else {
                return null;
            }
        }

        //getter setter functions
        function getMeta(path) {
            var i, j,
                meta = {children: {}, attributes: {}, pointers: {}, aspects: {}};

            if (_nodes === null || _nodes === undefined) {
                return meta;
            }
            var node = _nodes[path] || null;
            if (!node) {
                return null;
            }

            var metaNode = _core.getChild(node, '_meta');
            var childrenNode = _core.getChild(metaNode, 'children');
            //children
            meta.children = {};
            meta.children.minItems = [];
            meta.children.maxItems = [];
            meta.children.items = _core.getMemberPaths(childrenNode, 'items');
            for (i = 0; i < meta.children.items.length; i++) {
                meta.children.minItems.push(
                    _core.getMemberAttribute(childrenNode, 'items', meta.children.items[i], 'min') || -1);

                meta.children.maxItems.push(
                    _core.getMemberAttribute(childrenNode, 'items', meta.children.items[i], 'max') || -1);

                meta.children.items[i] = pathToRefObject(meta.children.items[i]);
            }
            meta.children.min = _core.getAttribute(childrenNode, 'min');
            meta.children.max = _core.getAttribute(childrenNode, 'max');

            //attributes - they are simple json objects from our point of view
            var atrNames = _core.getAttributeNames(metaNode);
            for (i = 0; i < atrNames.length; i++) {
                meta.attributes[atrNames[i]] = JSON.parse(JSON.stringify(
                    _core.getAttribute(metaNode, atrNames[i])));
            }

            //pointers and pointer lists
            var pointerNames = _core.getPointerNames(metaNode) || [];
            for (i = 0; i < pointerNames.length; i++) {
                var pointerNode = _core.getChild(metaNode, '_p_' + pointerNames[i]);
                var pointer = {};
                pointer.items = _core.getMemberPaths(pointerNode, 'items');
                pointer.min = _core.getAttribute(pointerNode, 'min');
                pointer.max = _core.getAttribute(pointerNode, 'max');
                pointer.minItems = [];
                pointer.maxItems = [];

                for (j = 0; j < pointer.items.length; j++) {
                    pointer.minItems.push(
                        _core.getMemberAttribute(pointerNode, 'items', pointer.items[j], 'min') || -1);

                    pointer.maxItems.push(
                        _core.getMemberAttribute(pointerNode, 'items', pointer.items[j], 'max') || -1);

                    pointer.items[j] = pathToRefObject(pointer.items[j]);

                }

                meta.pointers[pointerNames[i]] = pointer;
            }

            //aspects
            var aspectsNode = _core.getChild(metaNode, 'aspects');
            var aspectNames = _core.getPointerNames(aspectsNode);
            if (aspectNames.length > 0) {
                meta.aspects = {};
                for (i = 0; i < aspectNames.length; i++) {
                    var aspectNode = _core.getChild(aspectsNode, '_a_' + aspectNames[i]);
                    meta.aspects[aspectNames[i]] = {items: []};
                    var items = _core.getMemberPaths(aspectNode, 'items');
                    for (j = 0; j < items.length; j++) {
                        meta.aspects[aspectNames[i]].items.push(pathToRefObject(items[j]));
                    }
                }
            }

            return meta;
        }

        function setMeta(path, meta) {
            var i,
                j,
                aspectNode,
                targetPath;
            if (!isValidMeta) {
                return;
            }
            var node = _nodes[path] || null;
            if (node) {
                var metaNode = _core.getChild(node, '_meta');
                _core.deleteNode(metaNode, true);
                metaNode = _core.getChild(node, '_meta');
                if (meta.children) {
                    var childrenNode = _core.getChild(metaNode, 'children');
                    if (meta.children.items && meta.children.items.length) {
                        if (meta.children.min) {
                            _core.setAttribute(childrenNode, 'min', meta.children.min);
                        }
                        if (meta.children.max) {
                            _core.setAttribute(childrenNode, 'max', meta.children.max);
                        }

                        for (i = 0; i < meta.children.items.length; i++) {
                            targetPath = refObjectToPath(meta.children.items[i]);
                            if (typeof targetPath === 'string' && _nodes[targetPath]) {
                                _core.addMember(childrenNode, 'items', _nodes[targetPath]);
                                if (meta.children.minItems[i] !== -1) {
                                    _core.setMemberAttribute(childrenNode, 'items', targetPath, 'min',
                                        meta.children.minItems[i]);
                                }
                                if (meta.children.maxItems[i] !== -1) {
                                    _core.setMemberAttribute(childrenNode, 'items', targetPath, 'max',
                                        meta.children.maxItems[i]);
                                }
                            }
                        }

                    } else {
                        _core.deleteNode(childrenNode, true);
                    }
                }

                if (meta.attributes) {
                    for (i in meta.attributes) {
                        _core.setAttribute(metaNode, i, meta.attributes[i]);
                    }
                }

                if (meta.pointers) {
                    for (i in meta.pointers) {
                        _core.setPointer(metaNode, i, null);
                        var pointerNode = _core.getChild(metaNode, '_p_' + i);
                        if (meta.pointers[i].items && meta.pointers[i].items.length) {
                            if (meta.pointers[i].min) {
                                _core.setAttribute(pointerNode, 'min', meta.pointers[i].min);
                            }
                            if (meta.pointers[i].max) {
                                _core.setAttribute(pointerNode, 'max', meta.pointers[i].max);
                            }

                            for (j = 0; j < meta.pointers[i].items.length; j++) {
                                targetPath = refObjectToPath(meta.pointers[i].items[j]);
                                if (typeof targetPath === 'string' && _nodes[targetPath]) {
                                    _core.addMember(pointerNode, 'items', _nodes[targetPath]);
                                    if (meta.pointers[i].minItems[j] !== -1) {
                                        _core.setMemberAttribute(pointerNode, 'items', targetPath, 'min',
                                            meta.pointers[i].minItems[j]);
                                    }
                                    if (meta.pointers[i].maxItems[j] !== -1) {
                                        _core.setMemberAttribute(pointerNode, 'items', targetPath, 'max',
                                            meta.pointers[i].maxItems[j]);
                                    }
                                }
                            }

                        }
                    }
                }

                if (meta.aspects) {
                    var aspectsNode = _core.getChild(metaNode, 'aspects'),
                        aspectNames = [];
                    for (i in meta.aspects) {
                        _core.setPointer(aspectsNode, i, null);
                        aspectNode = _core.getChild(aspectsNode, '_a_' + i);
                        if (meta.aspects[i].items) {
                            for (j = 0; j < meta.aspects[i].items.length; j++) {
                                var member = _nodes[refObjectToPath(meta.aspects[i].items[j])];
                                if (member) {
                                    _core.addMember(aspectNode, 'items', member);
                                }
                            }
                        }
                        aspectNames.push(i);
                    }
                    if (aspectNames.length > 0) {
                        meta.aspects = {};
                        for (i = 0; i < aspectNames.length; i++) {
                            aspectNode = _core.getChild(aspectsNode, '_a_' + aspectNames[i]);
                            meta.aspects[aspectNames[i]] = {items: []};
                            var items = _core.getMemberPaths(aspectNode, 'items');
                            for (j = 0; j < items.length; j++) {
                                meta.aspects[aspectNames[i]].items.push(pathToRefObject(items[j]));
                            }
                        }
                    }
                }

                var metaEvent = _core.getRegistry(node, '_meta_event_') || 0;
                _core.setRegistry(node, '_meta_event_', metaEvent + 1);
                _save('setMeta(' + path + ')');
            }
        }


        //validation functions
        function getBaseChain(path) {
            var chain = [];
            var node = _nodes[path];
            if (node) {
                while (node !== null) {
                    chain.push(_core.getPath(node));
                    node = _core.getBase(node);
                }
            }
            return chain;
        }

        function isTypeOf(path, typePath) {
            var node = _nodes[path];
            if (node) {
                var chain = getBaseChain(path);
                if (chain.indexOf(typePath) !== -1) {
                    return true;
                }
            }
            return false;
        }

        function isValidTypeOfArray(path, typePathArray) {
            var i = 0,
                isGood = false;
            while (i < typePathArray.length && isGood === false) {
                isGood = isTypeOf(path, typePathArray[i]);
                i++;
            }
            return isGood;
        }

        function isValidChild(path, childPath) {
            var node = _nodes[path];
            var child = _nodes[childPath];
            if (node && child) {
                var metaNode = _core.getChild(node, '_meta');
                var childrenNode = _core.getChild(metaNode, 'children');
                var items = _core.getMemberPaths(childrenNode, 'items');
                return isValidTypeOfArray(childPath, items);
            }
            return false;
        }

        function isValidTarget(path, name, targetPath) {
            var node = _nodes[path];
            var target = _nodes[targetPath];
            if (node && target) {
                var meta = _core.getChild(node, '_meta');
                var pointer = _core.getChild(meta, '_p_' + name);
                var items = _core.getMemberPaths(pointer, 'items');
                return isValidTypeOfArray(targetPath, items);
            }
            return false;
        }

        function isValidAttribute(/*path, name, attribute*/) {
            //TODO we should check against schema
            return true;
        }

        function getValidChildrenTypes(path) {
            var node = _nodes[path];
            if (node) {
                return _core.getMemberPaths(_core.getChild(_core.getChild(node, '_meta'), 'children'), 'items');
            }
            return [];
        }

        function getValidTargetTypes(path, name) {
            var node = _nodes[path];
            if (node) {
                return _core.getMemberPaths(_core.getChild(_core.getChild(node, '_meta'), '_p_' + name), 'items');
            }
            return [];
        }

        function hasOwnMetaRules(path) {
            var node = _nodes[path];
            if (node) {
                var own = getMeta(path);
                var base = getMeta(_core.getPath(_core.getBase(node)));
                return own === base;
            }
            return false;
        }

        function filterValidTarget(path, name, paths) {
            var targets = [];
            for (var i = 0; i < paths.length; i++) {
                if (isValidTarget(path, name, paths[i])) {
                    targets.push(paths[i]);
                }
            }
            return targets;
        }

        function getOwnValidChildrenTypes(path) {
            var node = _nodes[path];
            var items = [];
            if (node) {
                var own = getValidChildrenTypes(path);
                var base = getValidChildrenTypes(_core.getPath(_core.getBase(node)));
                for (var i = 0; i < own.length; i++) {
                    if (base.indexOf(own[i]) === -1) {
                        items.push(own[i]);
                    }
                }
            }
            return items;
        }

        function getOwnValidTargetTypes(path, name) {
            var node = _nodes[path];
            var items = [];
            if (node) {
                var own = getValidTargetTypes(path, name);
                var base = getValidTargetTypes(_core.getPath(_core.getBase(node)), name);
                for (var i = 0; i < own.length; i++) {
                    if (base.indexOf(own[i]) === -1) {
                        items.push(own[i]);
                    }
                }
            }
            return items;
        }

        function getValidAttributeNames(path) {
            var rawMeta = getMeta(path),
                names = [];
            if (rawMeta) {
                for (var i in rawMeta.attributes) {
                    names.push(i);
                }
            }
            return names;
        }

        function getOwnValidAttributeNames(path) {
            var names = [],
                node = _nodes[path];

            if (node) {
                var own = getValidAttributeNames(path);
                var base = getValidAttributeNames(_core.getPath(_core.getBase(node)));
                for (var i = 0; i < own.length; i++) {
                    if (base.indexOf(own[i]) === -1) {
                        names.push(own[i]);
                    }
                }
            }
            return names;
        }

        function indexOfPathInRefObjArray(array, path) {
            var index = 0;
            while (index < array.length) {
                if (path === refObjectToPath(array[index])) {
                    return index;
                }
                index++;
            }
            return -1;
        }

        function getChildrenMeta(path) {
            //the returned object structure is : {'min':0,'max':0,'items':[{'id':path,'min':0,'max':0},...]}
            var rawMeta = getMeta(path);
            if (rawMeta) {
                var childrenMeta = {};
                childrenMeta.min = rawMeta.children.min;
                childrenMeta.max = rawMeta.children.max;
                childrenMeta.items = rawMeta.children.items;
                if (childrenMeta.items !== null) {
                    for (var i = 0; i < childrenMeta.items.length; i++) {
                        var child = {};
                        child.id = refObjectToPath(childrenMeta.items[i]);
                        if (rawMeta.children.minItems) {
                            child.min = rawMeta.children.minItems[i] === -1 ? undefined : rawMeta.children.minItems[i];
                        }
                        if (rawMeta.children.maxItems) {
                            child.max = rawMeta.children.maxItems[i] === -1 ? undefined : rawMeta.children.maxItems[i];
                        }

                        childrenMeta.items[i] = child;
                    }
                }

                return childrenMeta;
            }
            return null;
        }

        function getChildrenMetaAttribute(path/*, attrName*/) {
            var childrenMeta = getChildrenMeta(path);
            if (childrenMeta) {
                return childrenMeta.attrName;
            }
            return null;
        }

        function setChildrenMetaAttribute(path, attrName, value) {
            if (attrName !== 'items') {
                var rawMeta = getMeta(path);
                rawMeta.children[attrName] = value;
                setMeta(path, rawMeta);
            }
        }

        function getValidChildrenItems(path) {
            var childrenMeta = getChildrenMeta(path);
            if (childrenMeta) {
                return childrenMeta.items;
            }
            return null;
        }

        function updateValidChildrenItem(path, newTypeObj) {
            var i,
                rawMeta;
            if (newTypeObj && newTypeObj.id) {
                rawMeta = getMeta(path);
                if (rawMeta) {
                    if (rawMeta.children.minItems === null || rawMeta.children.minItems === undefined) { //TODO: use ! ?
                        rawMeta.children.minItems = [];
                        for (i = 0; i < rawMeta.children.items.length; i++) {
                            rawMeta.children.minItems.push(-1);
                        }
                    }
                    if (rawMeta.children.maxItems === null || rawMeta.children.maxItems === undefined) { //TODO: use ! ?
                        rawMeta.children.maxItems = [];
                        for (i = 0; i < rawMeta.children.items.length; i++) {
                            rawMeta.children.maxItems.push(-1);
                        }
                    }
                    var refObj = pathToRefObject(newTypeObj.id);
                    var index = indexOfPathInRefObjArray(rawMeta.children.items, newTypeObj.id);
                    if (index === -1) {
                        index = rawMeta.children.items.length;
                        rawMeta.children.items.push(refObj);
                        rawMeta.children.minItems.push(-1);
                        rawMeta.children.maxItems.push(-1);
                    }
                    // jshint expr:true
                    (newTypeObj.min === null || newTypeObj.min === undefined) ?
                        rawMeta.children.minItems[index] = -1 : rawMeta.children.minItems[index] = newTypeObj.min;

                    (newTypeObj.max === null || newTypeObj.max === undefined) ?
                        rawMeta.children.maxItems[index] = -1 : rawMeta.children.maxItems[index] = newTypeObj.max;
                    // jshint expr:false
                    setMeta(path, rawMeta);
                }
            }
        }

        function removeValidChildrenItem(path, typeId) {
            var rawMeta = getMeta(path);
            if (rawMeta) {
                //var refObj = pathToRefObject(typeId);
                var index = indexOfPathInRefObjArray(rawMeta.children.items, typeId);
                if (index !== -1) {
                    rawMeta.children.items.splice(index, 1);
                    if (rawMeta.children.minItems) {
                        rawMeta.children.minItems.splice(index, 1);
                    }
                    if (rawMeta.children.maxItems) {
                        rawMeta.children.maxItems.splice(index, 1);
                    }
                    setMeta(path, rawMeta);
                }
            }
        }

        function getAttributeSchema(path, name) {
            var rawMeta = getMeta(path);
            if (rawMeta) {
                if (rawMeta.attributes[name]) {
                    return rawMeta.attributes[name];
                }
            }
            return null;
        }

        function setAttributeSchema(path, name, schema) {
            var rawMeta = getMeta(path);
            if (rawMeta) {
                //TODO check schema validity - but it is also viable to check it only during setMeta
                rawMeta.attributes[name] = schema;
                setMeta(path, rawMeta);
            }
        }

        function removeAttributeSchema(path, name) {
            var rawMeta = getMeta(path);
            if (rawMeta) {
                delete rawMeta.attributes[name];
                setMeta(path, rawMeta);
            }
        }

        function getPointerMeta(path, name) {
            //the returned object structure is : {'min':0,'max':0,'items':[{'id':path,'min':0,'max':0},...]}
            var rawMeta = getMeta(path);
            if (rawMeta && rawMeta.pointers[name]) {
                var pointerMeta = {};
                pointerMeta.min = rawMeta.pointers[name].min;
                pointerMeta.max = rawMeta.pointers[name].max;
                pointerMeta.items = rawMeta.pointers[name].items;
                if (pointerMeta.items !== null) {
                    for (var i = 0; i < pointerMeta.items.length; i++) {
                        var child = {};
                        child.id = refObjectToPath(pointerMeta.items[i]);
                        if (rawMeta.pointers[name].minItems) {
                            child.min = rawMeta.pointers[name].minItems[i] === -1 ?
                                undefined : rawMeta.pointers[name].minItems[i]; //FIXME: avoid assigning undefined
                        }
                        if (rawMeta.pointers[name].maxItems) {
                            child.max = rawMeta.pointers[name].maxItems[i] === -1 ?
                                undefined : rawMeta.pointers[name].maxItems[i]; //FIXME: avoid assigning undefined
                        }
                        pointerMeta.items[i] = child;
                    }
                }
                return pointerMeta;
            }
            return null;
        }

        function getValidTargetItems(path, name) {
            var pointerMeta = getPointerMeta(path, name);
            if (pointerMeta) {
                return pointerMeta.items;
            }
            return null;
        }

        function updateValidTargetItem(path, name, targetObj) {
            var rawMeta = getMeta(path);
            if (rawMeta && targetObj && targetObj.id) {
                var pointer = rawMeta.pointers[name] || null;
                if (pointer === null) {
                    rawMeta.pointers[name] = {items: [], minItems: [], maxItems: []};
                    pointer = rawMeta.pointers[name];
                }
                var refObj = pathToRefObject(targetObj.id);
                var index = indexOfPathInRefObjArray(pointer.items, targetObj.id);
                if (index === -1) {
                    index = pointer.items.length;
                    pointer.items.push(refObj);
                    pointer.minItems.push(-1);
                    pointer.maxItems.push(-1);
                }
                // jshint expr:true
                (targetObj.min === null || targetObj.min === undefined) ?
                    pointer.minItems[index] = -1 : pointer.minItems[index] = targetObj.min;

                (targetObj.max === null || targetObj.max === undefined) ?
                    pointer.maxItems[index] = -1 : pointer.maxItems[index] = targetObj.max;
                // jshint expr:false
                setMeta(path, rawMeta);
            }
        }

        function removeValidTargetItem(path, name, targetId) {
            var rawMeta = getMeta(path);
            if (rawMeta) {
                var pointer = rawMeta.pointers[name] || null;
                if (pointer !== null) {
                    //var refObj = pathToRefObject(targetId);
                    var index = indexOfPathInRefObjArray(pointer.items, targetId);
                    if (index !== -1) {
                        pointer.items.splice(index, 1);
                        if (pointer.minItems) {
                            pointer.minItems.splice(index, 1);
                        }
                        if (pointer.maxItems) {
                            pointer.maxItems.splice(index, 1);
                        }
                        setMeta(path, rawMeta);
                    }
                }
            }
        }

        function deleteMetaPointer(path, name) {
            var rawMeta = getMeta(path);
            if (rawMeta) {
                delete rawMeta.pointers[name];
                setMeta(path, rawMeta);
            }
        }

        function setPointerMeta(path, name, meta) {
            var rawMeta = getMeta(path);
            if (rawMeta) {
                var pointer = rawMeta.pointers[name] || null;
                if (pointer === null) {
                    rawMeta.pointers[name] = {items: [], minItems: [], maxItems: []};
                    pointer = rawMeta.pointers[name];
                }
                pointer.min = meta.min;
                pointer.max = meta.max;
                if (meta.items && meta.items.length) {
                    for (var i = 0; i < meta.items.length; i++) {
                        pointer.items.push(pathToRefObject(meta.items[i].id));
                        pointer.minItems.push(meta.items[i].min || -1);
                        pointer.maxItems.push(meta.items[i].max || -1);
                    }
                }
                setMeta(path, rawMeta);
            }
        }

        function setChildrenMeta(path, name, meta) {
            var rawMeta = getMeta(path);
            if (rawMeta) {
                var children = rawMeta.children;

                children.min = meta.min;
                children.max = meta.max;
                if (meta.items && meta.items.length) {
                    for (var i = 0; i < meta.items.length; i++) {
                        children.items.push(pathToRefObject(meta.items[i].id));
                        children.minItems.push(meta.items[i].min || -1);
                        children.maxItems.push(meta.items[i].max || -1);
                    }
                }
                setMeta(path, rawMeta);
            }
        }

        function getMetaAspectNames(path) {
            var rawMeta = getMeta(path),
                names = [];

            if (rawMeta && rawMeta.aspects) {
                for (var i in rawMeta.aspects) {
                    names.push(i);
                }
            }
            return names;
        }

        function getOwnMetaAspectNames(path) {
            var names = getMetaAspectNames(path),
                ownNames = [];
            if (_nodes[path]) {
                var baseNames = getMetaAspectNames(_core.getPath(_core.getBase(_nodes[path])));
                for (var i = 0; i < names.length; i++) {
                    if (baseNames.indexOf(names[i]) === -1) {
                        ownNames.push(names[i]);
                    }
                }
            }
            return ownNames;
        }

        function getMetaAspect(path, name) {
            var rawMeta = getMeta(path);
            if (rawMeta) {
                if (rawMeta.aspects[name]) {
                    var aspect = {items: []};
                    for (var i = 0; i < rawMeta.aspects[name].items.length; i++) {
                        aspect.items.push(refObjectToPath(rawMeta.aspects[name].items[i]));
                    }
                    if (aspect.items.length === 0) {
                        delete aspect.items;
                    }
                    return aspect;
                }
                return null;
            }
            return null;
        }

        function setMetaAspect(path, name, aspect) {
            var rawMeta = getMeta(path);
            if (rawMeta) {

                rawMeta.aspects = rawMeta.aspects || {};
                rawMeta.aspects[name] = {items: []};
                for (var i = 0; i < aspect.items.length; i++) {
                    rawMeta.aspects[name].items.push(pathToRefObject(aspect.items[i]));
                }
                setMeta(path, rawMeta);
            }
        }

        function getAspectTerritoryPattern(path, name) {
            var aspect = getMetaAspect(path, name);
            if (aspect !== null) {
                aspect.children = 1; //TODO now it is fixed, maybe we can change that in the future
                return aspect;
            }
            return null;
        }

        function deleteMetaAspect(path, name) {
            var rawMeta = getMeta(path);
            if (rawMeta) {
                if (rawMeta.aspects && rawMeta.aspects[name]) {
                    delete rawMeta.aspects[name];
                    setMeta(path, rawMeta);
                }
            }
        }

        return {
            refObjectToPath: refObjectToPath,
            pathToRefObject: pathToRefObject,


            initialize: initialize,
            getMeta: getMeta,
            setMeta: setMeta,
            isTypeOf: isTypeOf,
            hasOwnMetaRules: hasOwnMetaRules,

            //containment
            isValidChild: isValidChild,
            getChildrenMeta: getChildrenMeta,
            setChildrenMeta: setChildrenMeta,
            getChildrenMetaAttribute: getChildrenMetaAttribute,
            setChildrenMetaAttribute: setChildrenMetaAttribute,
            getValidChildrenTypes: getValidChildrenTypes,
            getOwnValidChildrenTypes: getOwnValidChildrenTypes,
            getValidChildrenItems: getValidChildrenItems,
            updateValidChildrenItem: updateValidChildrenItem,
            removeValidChildrenItem: removeValidChildrenItem,

            //attribute
            isValidAttribute: isValidAttribute,
            getAttributeSchema: getAttributeSchema,
            setAttributeSchema: setAttributeSchema,
            removeAttributeSchema: removeAttributeSchema,
            getValidAttributeNames: getValidAttributeNames,
            getOwnValidAttributeNames: getOwnValidAttributeNames,

            //pointer
            isValidTarget: isValidTarget,
            getPointerMeta: getPointerMeta,
            setPointerMeta: setPointerMeta,
            getValidTargetItems: getValidTargetItems,
            getValidTargetTypes: getValidTargetTypes,
            getOwnValidTargetTypes: getOwnValidTargetTypes,
            filterValidTarget: filterValidTarget,
            updateValidTargetItem: updateValidTargetItem,
            removeValidTargetItem: removeValidTargetItem,
            deleteMetaPointer: deleteMetaPointer,

            //aspect
            getMetaAspectNames: getMetaAspectNames,
            getOwnMetaAspectNames: getOwnMetaAspectNames,
            getMetaAspect: getMetaAspect,
            setMetaAspect: setMetaAspect,
            getAspectTerritoryPattern: getAspectTerritoryPattern,
            deleteMetaAspect: deleteMetaAspect

        };
    }

    return metaStorage;
});

/*globals define*/
/*jshint browser: true, node:true*/

/**
 * @author kecso / https://github.com/kecso
 */

define('common/util/url',[],function () {
    

    function decodeUrl(url) {
        var start = url.indexOf('%');
        while (start > -1) {
            var char = String.fromCharCode(parseInt(url.substr(start + 1, 2), 16));
            url = url.replace(url.substr(start, 3), char);
            start = url.indexOf('%');
        }
        return url;
    }

    function parseCookie(cookie) {
        cookie = decodeUrl(cookie);
        var parsed = {};
        var elements = cookie.split(/[;,] */);
        for (var i = 0; i < elements.length; i++) {
            var pair = elements[i].split('=');
            parsed[pair[0]] = pair[1];
        }
        return parsed;
    }

    function removeSpecialChars(text) {
        text = text.replace(/%23/g, '#');
        text = text.replace(/%26/g, '&');
        text = text.replace(/%2f/g, '/');
        text = text.replace(/%2F/g, '/');
        return text;
    }

    function addSpecialChars(text) {
        if (text === undefined) {
            return text;
        }
        text = text.replace(/#/g, '%23');
        text = text.replace(/&/g, '%26');
        text = text.replace(/\//g, '%2F');
        return text;
    }

    function urlToRefObject(url) {
        return {
            $ref: url
        };
    }

    return {
        decodeUrl: decodeUrl,
        parseCookie: parseCookie,
        removeSpecialChars: removeSpecialChars,
        addSpecialChars: addSpecialChars,
        urlToRefObject: urlToRefObject
    };
});

/*globals define*/
/*jshint node: true, browser: true*/

/**
 * @author kecso / https://github.com/kecso
 */

define('common/core/users/tojson',['common/core/users/meta', 'common/util/url'], function (BaseMeta, URL) {
    

    var META = new BaseMeta(),
        _refTypes = {
            url: 'url',
            path: 'path',
            guid: 'guid'
        };

    var changeRefObjects = function (refType, urlPrefix, object, core, root, callback) {
        var i;
        if (typeof object === 'object') {
            var needed = 0,
                neededNames = [],
                error = null;
            for (i in object) { // TODO: use key here instead
                if (object[i] !== null && typeof object[i] === 'object') {
                    needed++;
                    neededNames.push(i);
                }
            }
            if (needed > 0) {
                for (i = 0; i < neededNames.length; i++) {
                    if (object[neededNames[i]].$ref) {
                        //reference object
                        pathToRefObjAsync(refType, urlPrefix, object[neededNames[i]].$ref/*.substring(1)*/,
                            core, root,
                            function (err, refObj) {
                                error = error || err;
                                object[neededNames[i]] = refObj;
                                if (--needed === 0) {
                                    callback(error);
                                }
                            }
                        );
                    } else {
                        changeRefObjects(refType, urlPrefix, object[neededNames[i]], core, root, function (err) {
                            error = error || err;
                            if (--needed === 0) {
                                callback(error);
                            }
                        });
                    }
                }
            } else {
                callback(null);
            }
        } else {
            callback(null);
        }
    };

    var pathToRefObj = function (refType, urlPrefix, path) {
        var result;
        switch (refType) {
            case _refTypes.url:
                if (path === null) {
                    result = URL.urlToRefObject(null);
                } else {
                    result = URL.urlToRefObject(urlPrefix + '&path=' + URL.addSpecialChars(path));
                }
                break;
            case _refTypes.path:
                result = URL.urlToRefObject(path);
                break;
            default:
                result = URL.urlToRefObject(null);
                break;
        }

        return result;
    };

    var getParentRefObject = function (refType, urlPrefix, core, node) {
        var parent = core.getParent(node),
            path = null,
            result;

        if (parent) {
            path = core.getPath(parent);
        }
        switch (refType) {
            case _refTypes.url:
                if (path === null) {
                    result = URL.urlToRefObject(null);
                } else {
                    result = URL.urlToRefObject(urlPrefix + '&path=' + URL.addSpecialChars(path));
                }
                break;
            case _refTypes.path:
                result = URL.urlToRefObject(path);
                break;
            case _refTypes.guid:
                if (path === null) {
                    result = URL.urlToRefObject(null);
                } else {
                    var refObj = URL.urlToRefObject(path);
                    refObj.GUID = core.getGuid(parent);
                    result = refObj;
                }
                break;
        }

        return result;
    };

    var pathToRefObjAsync = function (refType, urlPrefix, path, core, root, callback) {
        switch (refType) {
            case _refTypes.url:
                if (path === null) {
                    callback(null, URL.urlToRefObject(null));
                }
                callback(null, URL.urlToRefObject(urlPrefix + '&path=' + URL.addSpecialChars(path)));
                break;
            case _refTypes.path:
                callback(null, URL.urlToRefObject(path));
                break;
            case _refTypes.guid:
                core.loadByPath(root, path, function (err, node) {
                    if (err) {
                        callback(err, null);
                    } else {
                        var refObj = URL.urlToRefObject(path);
                        refObj.GUID = core.getGuid(node);
                        callback(null, refObj);
                    }
                });
                break;
            default:
                callback(null, URL.urlToRefObject(null));
        }
    };

    var getChildrenGuids = function (core, node, callback) {
        var GUIDHash = {};
        core.loadChildren(node, function (err, children) {
            if (err) {
                callback(err, null);
            } else {
                for (var i = 0; i < children.length; i++) {
                    GUIDHash[core.getPath(children[i])] = core.getGuid(children[i]);
                }
                callback(null, GUIDHash);
            }
        });
    };

    var getMetaOfNode = function (core, node, urlPrefix, refType, callback) {
        var meta = META.getMeta(core.getPath(node));
        changeRefObjects(refType, urlPrefix, meta, core, core.getRoot(node), function (err) {
            callback(err, meta);
        });
    };

    var getChildrenOfNode = function (core, node, urlPrefix, refType, callback) {
        if (refType === _refTypes.guid) {
            getChildrenGuids(core, node, function (err, gHash) {
                if (err) {
                    callback(err);
                } else {
                    //TODO possibly it needs some ordering
                    var children = [];
                    for (var i in gHash) {
                        var refObj = URL.urlToRefObject(i);
                        refObj.GUID = gHash[i];
                        children.push(refObj);
                    }
                    callback(null, children);
                }
            });
        } else {
            var paths = core.getChildrenPaths(node);
            var children = [];
            for (var i = 0; i < paths.length; i++) {
                children.push(pathToRefObj(refType, urlPrefix, paths[i]));
            }
            callback(null, children);
        }
    };

    var getSetAttributesAndRegistry = function (core, node, setName, setOwnerPath, callback) {
        var path = core.getPath(node),
            i;
        core.loadByPath(core.getRoot(node), setOwnerPath, function (err, owner) {
            if (err) {
                callback(err);
            } else {
                if (owner) {
                    var atrAndReg = {attributes: {}, registry: {}};
                    var names = core.getMemberAttributeNames(owner, setName, path);
                    for (i = 0; i < names.length; i++) {
                        atrAndReg.attributes[names[i]] = core.getMemberAttribute(owner, setName, path, names[i]);
                    }
                    names = core.getMemberRegistryNames(owner, setName, path);
                    for (i = 0; i < names.length; i++) {
                        atrAndReg.registry[names[i]] = core.getMemberRegistry(owner, setName, path, names[i]);
                    }
                    callback(null, atrAndReg);
                } else {
                    callback('internal error', null);
                }
            }
        });
    };

    var getMemberAttributesAndRegistry = function (core, node, setName, memberPath) {
        var retObj = {attributes: {}, registry: {}},
            names,
            i;
        names = core.getMemberAttributeNames(node, setName, memberPath);
        for (i = 0; i < names.length; i++) {
            retObj.attributes[names[i]] = core.getMemberAttribute(node, setName, memberPath, names[i]);
        }
        names = core.getMemberRegistryNames(node, setName, memberPath);
        for (i = 0; i < names.length; i++) {
            retObj.registry[names[i]] = core.getMemberRegistry(node, setName, memberPath, names[i]);
        }
        return retObj;
    };

    var getSetsOfNode = function (core, node, urlPrefix, refType, callback) {
        var setsInfo = {};
        var createOneSetInfo = function (setName, callback) {
            var needed,
                members = (core.getMemberPaths(node, setName)).sort(), //TODO Remove the sort part at some point
                info = {from: [], to: [], set: true},
                i,
                error = null,
                containers = [],
                collectSetInfo = function (nodePath, container, callback) {
                    if (container === true) {
                        pathToRefObjAsync(refType, urlPrefix, nodePath, core, core.getRoot(node),
                            function (err, refObj) {
                                if (!err && refObj !== undefined && refObj !== null) {
                                    getSetAttributesAndRegistry(core, node, setName, nodePath,
                                        function (err, atrAndReg) {
                                            if (atrAndReg) {
                                                for (var j in atrAndReg) {
                                                    refObj[j] = atrAndReg[j];
                                                }
                                            }
                                            callback(err, refObj);
                                        }
                                    );
                                } else {
                                    callback(err, null);
                                }
                            }
                        );
                    } else {
                        //member
                        pathToRefObjAsync(refType, urlPrefix, nodePath, core, core.getRoot(node),
                            function (err, refObj) {
                                if (refObj !== undefined && refObj !== null) {
                                    var atrAndReg = getMemberAttributesAndRegistry(core, node, setName, nodePath);
                                    for (var j in atrAndReg) {
                                        refObj[j] = atrAndReg[j];
                                    }
                                    callback(err, refObj);
                                }
                            }
                        );
                    }
                };

            for (i in memberOfInfo) {
                if (memberOfInfo[i].indexOf(setName) !== -1) {
                    containers.push(i);
                }
            }

            needed = members.length + containers.length;
            if (needed > 0) {
                for (i = 0; i < members.length; i++) {
                    collectSetInfo(members[i], false, function (err, refObj) {
                        error = error || err;
                        if (refObj !== undefined && refObj !== null) {
                            info.to.push(refObj);
                        }

                        if (--needed === 0) {
                            if (error === null) {
                                setsInfo[setName] = info;
                            }
                            callback(error);
                        }
                    });
                }

                for (i = 0; i < containers.length; i++) {
                    collectSetInfo(containers[i], true, function (err, refObj) {
                        error = error || err;
                        if (refObj !== undefined && refObj !== null) {
                            info.from.push(refObj);
                        }

                        if (--needed === 0) {
                            if (error === null) {
                                setsInfo[setName] = info;
                            }
                            callback(error);
                        }
                    });
                }
            } else {
                callback(null);
            }
        };

        var tArray = core.getSetNames(node),
            memberOfInfo = core.isMemberOf(node),
            i, j, needed, error = null;
        for (j in memberOfInfo) {
            for (i = 0; i < memberOfInfo[j].length; i++) {
                if (tArray.indexOf(memberOfInfo[j][i]) === -1) {
                    tArray.push(memberOfInfo[j][i]);
                }
            }
        }
        needed = tArray.length;
        if (needed > 0) {
            for (i = 0; i < tArray.length; i++) {
                createOneSetInfo(tArray[i], function (err) {
                    error = error || err;
                    if (--needed === 0) {
                        callback(error, setsInfo);
                    }
                });
            }
        } else {
            callback(null, setsInfo);
        }
    };

    var getPointersGUIDs = function (core, node, callback) {
        var gHash = {},
            pointerNames = core.getPointerNames(node),
            collectionNames = core.getCollectionNames(node),
            needed = pointerNames.length + collectionNames.length,
            error = null,
            i;
        if (needed > 0) {
            //pointers
            for (i = 0; i < pointerNames.length; i++) {
                core.loadPointer(node, pointerNames[i], function (err, pointer) {
                    error = error || err;
                    if (pointer) {
                        if (gHash[core.getPath(pointer)] === undefined) {
                            gHash[core.getPath(pointer)] = core.getGuid(pointer);
                        }
                    }

                    if (--needed === 0) {
                        callback(error, gHash);
                    }
                });
            }
            //collections
            for (i = 0; i < collectionNames.length; i++) {
                core.loadCollection(node, collectionNames[i], function (err, collection) {
                    error = error || err;
                    if (collection) {
                        for (var j = 0; j < collection.length; j++) {
                            if (gHash[core.getPath(collection[j])] === undefined) {
                                gHash[core.getPath(collection[j])] = core.getGuid(collection[j]);
                            }
                        }
                    }

                    if (--needed === 0) {
                        callback(error, gHash);
                    }
                });
            }
        } else {
            callback(error, gHash);
        }
    };

    var getPointersOfNode = function (core, node, urlPrefix, refType, callback) {
        var GUIDHash = {};
        var getRefObj = function (path) {
            if (refType === _refTypes.guid) {
                var refObj = URL.urlToRefObject(path);
                refObj.GUID = GUIDHash[path];
                return refObj;
            } else {
                return pathToRefObj(refType, urlPrefix, path);
            }
        };
        var initialized = function () {
            var pointers = {},
                tArray = core.getPointerNames(node),
                t2Array = core.getCollectionNames(node),
                i, j;
            for (i = 0; i < t2Array.length; i++) {
                if (tArray.indexOf(t2Array[i]) === -1) {
                    tArray.push(t2Array[i]);
                }
            }
            for (i = 0; i < tArray.length; i++) {
                var coll = core.getCollectionPaths(node, tArray[i]);
                var pointer = {to: [], from: [], set: false},
                    pPath = core.getPointerPath(node, tArray[i]);
                if (pPath !== undefined) {
                    pointer.to.push(getRefObj(pPath));
                }
                for (j = 0; j < coll.length; j++) {
                    pointer.from.push(getRefObj(coll[j]));
                }
                pointers[tArray[i]] = pointer;
            }
            callback(null, pointers);
        };

        //start
        if (refType === _refTypes.guid) {
            getPointersGUIDs(core, node, function (err, gHash) {
                if (err) {
                    callback(err, null);
                } else {
                    GUIDHash = gHash;
                    initialized();
                }
            });
        } else {
            initialized();
        }
    };

    var getOwnPartOfNode = function (core, node) {
        var own = {attributes: [], registry: [], pointers: []};
        own.attributes = core.getOwnAttributeNames(node);
        own.registry = core.getOwnRegistryNames(node);
        own.pointers = core.getOwnPointerNames(node);
        return own;
    };

    var getJsonNode = function (core, node, urlPrefix, refType, callback) {
        var nodes = {},
            tArray,
            i,
            jNode;

        if (refType === _refTypes.guid && typeof core.getGuid !== 'function') {
            callback(new Error('cannot provide GUIDs'), null);
        }

        nodes[core.getPath(node)] = node;
        META.initialize(core, nodes, function () {
            //TODO: is this asynchronous?
        });

        jNode = {
            meta: {},
            children: [],
            attributes: {},
            pointers: {},
            registry: {}
        };


        //basic parts of the node
        //GUID
        if (typeof core.getGuid === 'function') {
            jNode.GUID = core.getGuid(node);
        }
        //RELID
        jNode.RELID = core.getRelid(node);
        //registry entries
        tArray = core.getRegistryNames(node);
        for (i = 0; i < tArray.length; i++) {
            jNode.registry[tArray[i]] = core.getRegistry(node, tArray[i]);
        }
        //attribute entries
        tArray = core.getAttributeNames(node);
        for (i = 0; i < tArray.length; i++) {
            jNode.attributes[tArray[i]] = core.getAttribute(node, tArray[i]);
        }

        //own part of the node
        jNode.OWN = getOwnPartOfNode(core, node);

        //reference to parent
        jNode.parent = getParentRefObject(refType, urlPrefix, core, node);


        //now calling the relational parts
        var needed = 4,
            error = null;
        getChildrenOfNode(core, node, urlPrefix, refType, function (err, children) {
            error = error || err;
            jNode.children = children;
            if (--needed === 0) {
                callback(error, jNode);
            }
        });
        getMetaOfNode(core, node, urlPrefix, refType, function (err, meta) {
            error = error || err;
            jNode.meta = meta;
            if (--needed === 0) {
                callback(error, jNode);
            }
        });
        getPointersOfNode(core, node, urlPrefix, refType, function (err, pointers) {
            error = error || err;
            for (var i in pointers) {
                jNode.pointers[i] = pointers[i];
            }
            if (--needed === 0) {
                callback(error, jNode);
            }
        });
        getSetsOfNode(core, node, urlPrefix, refType, function (err, sets) {
            error = error || err;
            for (var i in sets) {
                jNode.pointers[i] = sets[i];
            }
            if (--needed === 0) {
                callback(error, jNode);
            }
        });
    };

    return getJsonNode;
});

/*globals define*/
/*jshint browser: true*/
/**
 * @author kecso / https://github.com/kecso
 */
define('js/client/gmeNodeGetter',['common/core/users/tojson'], function (toJson) {
    

    //getNode
    function getNode(_id, logger, state, meta, storeNode) {

        function getParentId() {
            //just for sure, as it may missing from the cache
            return storeNode(state.core.getParent(state.nodes[_id].node));
        }

        function getId() {
            return _id;
        }

        function getGuid() {
            return state.core.getGuid(state.nodes[_id].node);
        }

        function getChildrenIds() {
            return state.core.getChildrenPaths(state.nodes[_id].node);
        }

        function getBaseId() {
            var base = state.core.getBase(state.nodes[_id].node);
            if (base) {
                return storeNode(base);
            } else {
                return null;
            }

        }

        function getInheritorIds() {
            return [];
        }

        function getAttribute(name) {
            return state.core.getAttribute(state.nodes[_id].node, name);
        }

        function getOwnAttribute(name) {
            return state.core.getOwnAttribute(state.nodes[_id].node, name);
        }

        function getEditableAttribute(name) {
            var value = state.core.getAttribute(state.nodes[_id].node, name);
            if (typeof value === 'object') {
                return JSON.parse(JSON.stringify(value));
            }
            return value;
        }

        function getOwnEditableAttribute(name) {
            var value = state.core.getOwnAttribute(state.nodes[_id].node, name);
            if (typeof value === 'object') {
                return JSON.parse(JSON.stringify(value));
            }
            return value;
        }

        function getRegistry(name) {
            return state.core.getRegistry(state.nodes[_id].node, name);
        }

        function getOwnRegistry(name) {
            return state.core.getOwnRegistry(state.nodes[_id].node, name);
        }

        function getEditableRegistry(name) {
            var value = state.core.getRegistry(state.nodes[_id].node, name);
            if (typeof value === 'object') {
                return JSON.parse(JSON.stringify(value));
            }
            return value;
        }

        function getOwnEditableRegistry(name) {
            var value = state.core.getOwnRegistry(state.nodes[_id].node, name);
            if (typeof value === 'object') {
                return JSON.parse(JSON.stringify(value));
            }
            return value;
        }

        function getPointer(name) {
            //return _core.getPointerPath(_nodes[_id].node,name);
            if (name === 'base') {
                //base is a special case as it complicates with inherited children
                return {to: state.core.getPath(state.core.getBase(state.nodes[_id].node)),
                    from: []};
            }
            return {to: state.core.getPointerPath(state.nodes[_id].node, name), from: []};
        }

        function getOwnPointer(name) {
            return {to: state.core.getOwnPointerPath(state.nodes[_id].node, name), from: []};
        }

        function getPointerNames() {
            return state.core.getPointerNames(state.nodes[_id].node);
        }

        function getOwnPointerNames() {
            return state.core.getOwnPointerNames(state.nodes[_id].node);
        }

        function getAttributeNames() {
            return state.core.getAttributeNames(state.nodes[_id].node);
        }

        function getOwnAttributeNames() {
            return state.core.getOwnAttributeNames(state.nodes[_id].node);
        }

        function getRegistryNames() {
            return state.core.getRegistryNames(state.nodes[_id].node);
        }

        function getOwnRegistryNames() {
            return state.core.getOwnRegistryNames(state.nodes[_id].node);
        }

        //SET
        function getMemberIds(setid) {
            return state.core.getMemberPaths(state.nodes[_id].node, setid);
        }

        function getSetNames() {
            return state.core.getSetNames(state.nodes[_id].node);
        }

        function getMemberAttributeNames(setid, memberid) {
            return state.core.getMemberAttributeNames(state.nodes[_id].node, setid, memberid);
        }

        function getMemberAttribute(setid, memberid, name) {
            return state.core.getMemberAttribute(state.nodes[_id].node, setid, memberid, name);
        }

        function getEditableMemberAttribute(setid, memberid, name) {
            var attr = state.core.getMemberAttribute(state.nodes[_id].node, setid, memberid, name);
            if (attr !== null && attr !== undefined) {
                return JSON.parse(JSON.stringify(attr));
            }
            return null;
        }

        function getMemberRegistryNames(setid, memberid) {
            return state.core.getMemberRegistryNames(state.nodes[_id].node, setid, memberid);
        }

        function getMemberRegistry(setid, memberid, name) {
            return state.core.getMemberRegistry(state.nodes[_id].node, setid, memberid, name);
        }

        function getEditableMemberRegistry(setid, memberid, name) {
            var attr = state.core.getMemberRegistry(state.nodes[_id].node, setid, memberid, name);
            if (attr !== null && attr !== undefined) {
                return JSON.parse(JSON.stringify(attr));
            }
            return null;
        }

        //META
        function getValidChildrenTypes() {
            //return getMemberIds('ValidChildren');
            return meta.getValidChildrenTypes(_id);
        }

        //constraint functions
        function getConstraintNames() {
            return state.core.getConstraintNames(state.nodes[_id].node);
        }

        function getOwnConstraintNames() {
            return state.core.getOwnConstraintNames(state.nodes[_id].node);
        }

        function getConstraint(name) {
            return state.core.getConstraint(state.nodes[_id].node, name);
        }

        function printData() {
            //probably we will still use it for test purposes, but now it goes officially
            // into printing the node's json representation
            toJson(state.core, state.nodes[_id].node, '', 'guid', function (err, jNode) {
                state.logger.debug('node in JSON format[status = ', err, ']:', jNode);
            });
        }

        function toString() {
            return state.core.getAttribute(state.nodes[_id].node, 'name') + ' (' + _id + ')';
        }

        function getCollectionPaths(name) {
            return state.core.getCollectionPaths(state.nodes[_id].node, name);
        }

        if (state.nodes[_id]) {
            return {
                getParentId: getParentId,
                getId: getId,
                getGuid: getGuid,
                getChildrenIds: getChildrenIds,
                getBaseId: getBaseId,
                getInheritorIds: getInheritorIds,
                getAttribute: getAttribute,
                getEditableAttribute: getEditableAttribute,
                getRegistry: getRegistry,
                getEditableRegistry: getEditableRegistry,
                getOwnAttribute: getOwnAttribute,
                getOwnEditableAttribute: getOwnEditableAttribute,
                getOwnRegistry: getOwnRegistry,
                getOwnEditableRegistry: getOwnEditableRegistry,
                getPointer: getPointer,
                getPointerNames: getPointerNames,
                getAttributeNames: getAttributeNames,
                getRegistryNames: getRegistryNames,
                getOwnAttributeNames: getOwnAttributeNames,
                getOwnRegistryNames: getOwnRegistryNames,
                getOwnPointer: getOwnPointer,
                getOwnPointerNames: getOwnPointerNames,

                //SetFunctions
                getMemberIds: getMemberIds,
                getSetNames: getSetNames,
                getMemberAttributeNames: getMemberAttributeNames,
                getMemberAttribute: getMemberAttribute,
                getEditableMemberAttribute: getEditableMemberAttribute,
                getMemberRegistryNames: getMemberRegistryNames,
                getMemberRegistry: getMemberRegistry,
                getEditableMemberRegistry: getEditableMemberRegistry,

                //META functions
                getValidChildrenTypes: getValidChildrenTypes,

                //constraint functions
                getConstraintNames: getConstraintNames,
                getOwnConstraintNames: getOwnConstraintNames,
                getConstraint: getConstraint,

                printData: printData,
                toString: toString,

                getCollectionPaths: getCollectionPaths

            };
        } else {
            //logger.warn('Tried to get node with path "' + _id + '" but was not in state.nodes');
        }

        return null;
    }

    return getNode;
});
/*globals define*/
/*jshint browser: true*/
/**
 * @author kecso / https://github.com/kecso
 */
define('js/client/gmeNodeSetter',[], function () {
    
    function gmeNodeSetter(logger, state, saveRoot, storeNode) {

        function setAttributes(path, name, value, msg) {
            if (state.core && state.nodes[path] && typeof state.nodes[path].node === 'object') {
                state.core.setAttribute(state.nodes[path].node, name, value);
                msg = msg || 'setAttribute(' + path + ',' + name + ',' + value + ')';
                saveRoot(msg);
            }
        }

        function delAttributes(path, name, msg) {
            if (state.core && state.nodes[path] && typeof state.nodes[path].node === 'object') {
                state.core.delAttribute(state.nodes[path].node, name);
                msg = msg || 'delAttribute(' + path + ',' + name + ')';
                saveRoot(msg);
            }
        }

        function setRegistry(path, name, value, msg) {
            if (state.core && state.nodes[path] && typeof state.nodes[path].node === 'object') {
                state.core.setRegistry(state.nodes[path].node, name, value);
                msg = msg || 'setRegistry(' + path + ',' + ',' + name + ',' + value + ')';
                saveRoot(msg);
            }
        }

        function delRegistry(path, name, msg) {
            if (state.core && state.nodes[path] && typeof state.nodes[path].node === 'object') {
                state.core.delRegistry(state.nodes[path].node, name);
                msg = msg || 'delRegistry(' + path + ',' + ',' + name + ')';
                saveRoot(msg);
            }
        }

        function copyMoreNodes(parameters, msg) {
            var pathestocopy = [],
                i,
                j,
                newNode;

            if (typeof parameters.parentId === 'string' && state.nodes[parameters.parentId] &&
                typeof state.nodes[parameters.parentId].node === 'object') {
                for (i in parameters) {
                    if (i !== 'parentId') {
                        pathestocopy.push(i);
                    }
                }

                msg = msg || 'copyMoreNodes(' + pathestocopy + ',' + parameters.parentId + ')';
                if (pathestocopy.length < 1) {
                    // empty on purpose
                } else if (pathestocopy.length === 1) {
                    newNode = state.core.copyNode(state.nodes[pathestocopy[0]].node,
                        state.nodes[parameters.parentId].node);
                    storeNode(newNode);
                    if (parameters[pathestocopy[0]]) {
                        for (j in parameters[pathestocopy[0]].attributes) {
                            if (parameters[pathestocopy[0]].attributes.hasOwnProperty(j)) {
                                state.core.setAttribute(newNode, j, parameters[pathestocopy[0]].attributes[j]);
                            }
                        }
                        for (j in parameters[pathestocopy[0]].registry) {
                            if (parameters[pathestocopy[0]].registry.hasOwnProperty(j)) {
                                state.core.setRegistry(newNode, j, parameters[pathestocopy[0]].registry[j]);
                            }
                        }
                    }
                    saveRoot(msg);
                } else {
                    copyMoreNodesAsync(pathestocopy, parameters.parentId, function (err, copyarr) {
                        var i,
                            j;
                        if (err) {
                            //rollBackModification();
                            state.logger.error(err);
                        } else {
                            for (i in copyarr) {
                                if (copyarr.hasOwnProperty(i) && parameters[i]) {
                                    for (j in parameters[i].attributes) {
                                        if (parameters[i].attributes.hasOwnProperty(j)) {
                                            state.core.setAttribute(copyarr[i], j, parameters[i].attributes[j]);
                                        }
                                    }
                                    for (j in parameters[i].registry) {
                                        if (parameters[i].registry.hasOwnProperty(j)) {
                                            state.core.setRegistry(copyarr[i], j, parameters[i].registry[j]);
                                        }
                                    }
                                }
                            }
                            saveRoot(msg);
                        }
                    });
                }
            } else {
                state.logger.error('wrong parameters for copy operation - denied -');
            }
        }

        function copyMoreNodesAsync(nodePaths, parentPath, callback) {
            var i,
                tempFrom,
                tempTo,
                helpArray,
                subPathArray,
                parent,
                returnArray,
                checkPaths = function () {
                    var i,
                        result = true;

                    for (i = 0; i < nodePaths.length; i += 1) {
                        result = result && (state.nodes[nodePaths[i]] &&
                            typeof state.nodes[nodePaths[i]].node === 'object');
                    }
                    return result;
                };

            if (state.nodes[parentPath] &&
                typeof state.nodes[parentPath].node === 'object' && checkPaths()) {
                helpArray = {};
                subPathArray = {};
                parent = state.nodes[parentPath].node;
                returnArray = {};

                //creating the 'from' object
                tempFrom = state.core.createNode({
                    parent: parent,
                    base: state.core.getTypeRoot(state.nodes[nodePaths[0]].node)
                });
                //and moving every node under it
                for (i = 0; i < nodePaths.length; i += 1) {
                    helpArray[nodePaths[i]] = {};
                    helpArray[nodePaths[i]].origparent =
                        state.core.getParent(state.nodes[nodePaths[i]].node);
                    helpArray[nodePaths[i]].tempnode =
                        state.core.moveNode(state.nodes[nodePaths[i]].node, tempFrom);
                    subPathArray[state.core.getRelid(helpArray[nodePaths[i]].tempnode)] = nodePaths[i];
                    delete state.nodes[nodePaths[i]];
                }

                //do the copy
                tempTo = state.core.copyNode(tempFrom, parent);

                //moving back the temporary source
                for (i = 0; i < nodePaths.length; i += 1) {
                    helpArray[nodePaths[i]].node = state.core.moveNode(helpArray[nodePaths[i]].tempnode,
                        helpArray[nodePaths[i]].origparent);
                    storeNode(helpArray[nodePaths[i]].node);
                }

                //gathering the destination nodes
                state.core.loadChildren(tempTo, function (err, children) {
                    var newNode;

                    if (!err && children && children.length > 0) {
                        for (i = 0; i < children.length; i += 1) {
                            if (subPathArray[state.core.getRelid(children[i])]) {
                                newNode = state.core.moveNode(children[i], parent);
                                storeNode(newNode);
                                returnArray[subPathArray[state.core.getRelid(children[i])]] = newNode;
                            } else {
                                state.logger.error('635 - should never happen!!!');
                            }
                        }
                        state.core.deleteNode(tempFrom);
                        state.core.deleteNode(tempTo);
                        callback(null, returnArray);
                    } else {
                        //clean up the mess and return
                        state.core.deleteNode(tempFrom);
                        state.core.deleteNode(tempTo);
                        callback(err, {});
                    }
                });
            }
        }

        function moveMoreNodes(parameters) {
            var pathsToMove = [],
                returnParams = {},
                i,
                j,
                newNode;

            for (i in parameters) {
                if (parameters.hasOwnProperty(i)) {
                    if (i !== 'parentId') {
                        pathsToMove.push(i);
                    }
                }
            }

            if (pathsToMove.length > 0 &&
                typeof parameters.parentId === 'string' &&
                state.nodes[parameters.parentId] &&
                typeof state.nodes[parameters.parentId].node === 'object') {
                for (i = 0; i < pathsToMove.length; i += 1) {
                    if (state.nodes[pathsToMove[i]] &&
                        typeof state.nodes[pathsToMove[i]].node === 'object') {
                        newNode = state.core.moveNode(state.nodes[pathsToMove[i]].node,
                            state.nodes[parameters.parentId].node);
                        returnParams[pathsToMove[i]] = state.core.getPath(newNode);
                        if (parameters[pathsToMove[i]].attributes) {
                            for (j in parameters[pathsToMove[i]].attributes) {
                                if (parameters[pathsToMove[i]].attributes.hasOwnProperty(j)) {
                                    state.core.setAttribute(newNode,
                                        j, parameters[pathsToMove[i]].attributes[j]);
                                }
                            }
                        }
                        if (parameters[pathsToMove[i]].registry) {
                            for (j in parameters[pathsToMove[i]].registry) {
                                if (parameters[pathsToMove[i]].registry.hasOwnProperty(j)) {
                                    state.core.setRegistry(newNode,
                                        j, parameters[pathsToMove[i]].registry[j]);
                                }
                            }
                        }

                        delete state.nodes[pathsToMove[i]];
                        storeNode(newNode, true);
                    }
                }
            }

            return returnParams;
        }

        function createChildren(parameters, msg) {
            //TODO we also have to check out what is happening with the sets!!!
            var result = {},
                paths = [],
                nodes = [],
                node,
                parent = state.nodes[parameters.parentId].node,
                names, i, j, index, pointer,
                newChildren = [],
                relations = [];

            //to allow 'meaningfull' instantiation of multiple objects
            // we have to recreate the internal relations - except the base
            paths = Object.keys(parameters);
            paths.splice(paths.indexOf('parentId'), 1);
            for (i = 0; i < paths.length; i++) {
                node = state.nodes[paths[i]].node;
                nodes.push(node);
                pointer = {};
                names = state.core.getPointerNames(node);
                index = names.indexOf('base');
                if (index !== -1) {
                    names.splice(index, 1);
                }

                for (j = 0; j < names.length; j++) {
                    index = paths.indexOf(state.core.getPointerPath(node, names[j]));
                    if (index !== -1) {
                        pointer[names[j]] = index;
                    }
                }
                relations.push(pointer);
            }

            //now the instantiation
            for (i = 0; i < nodes.length; i++) {
                newChildren.push(state.core.createNode({parent: parent, base: nodes[i]}));
            }

            //now for the storage and relation setting
            for (i = 0; i < paths.length; i++) {
                //attributes
                names = Object.keys(parameters[paths[i]].attributes || {});
                for (j = 0; j < names.length; j++) {
                    state.core.setAttribute(newChildren[i],
                        names[j], parameters[paths[i]].attributes[names[j]]);
                }
                //registry
                names = Object.keys(parameters[paths[i]].registry || {});
                for (j = 0; j < names.length; j++) {
                    state.core.setRegistry(newChildren[i],
                        names[j], parameters[paths[i]].registry[names[j]]);
                }

                //relations
                names = Object.keys(relations[i]);
                for (j = 0; j < names.length; j++) {
                    state.core.setPointer(newChildren[i], names[j], newChildren[relations[i][names[j]]]);
                }

                //store
                result[paths[i]] = storeNode(newChildren[i]);

            }

            msg = msg || 'createChildren(' + JSON.stringify(result) + ')';
            saveRoot(msg);
            return result;
        }

        //TODO should be removed as there is no user or public API related to this function
        //function deleteNode(path, msg) {
        //  if (state.core && state.nodes[path] && typeof state.nodes[path].node === 'object') {
        //    state.core.deleteNode(state.nodes[path].node);
        //    //delete state.nodes[path];
        //    msg = msg || 'deleteNode(' + path + ')';
        //    saveRoot(msg);
        //  }
        //}

        function delMoreNodes(paths, msg) {
            if (state.core) {
                for (var i = 0; i < paths.length; i++) {
                    if (state.nodes[paths[i]] && typeof state.nodes[paths[i]].node === 'object') {
                        state.core.deleteNode(state.nodes[paths[i]].node);
                        //delete state.nodes[paths[i]];
                    }
                }
                msg = msg || 'delMoreNodes(' + paths + ')';
                saveRoot(msg);
            }
        }

        function createChild(parameters, msg) {
            var newID;

            if (state.core) {
                if (typeof parameters.parentId === 'string' && state.nodes[parameters.parentId] &&
                    typeof state.nodes[parameters.parentId].node === 'object') {
                    var baseNode = null;
                    if (state.nodes[parameters.baseId]) {
                        baseNode = state.nodes[parameters.baseId].node || baseNode;
                    }
                    var child = state.core.createNode({
                        parent: state.nodes[parameters.parentId].node,
                        base: baseNode,
                        guid: parameters.guid,
                        relid: parameters.relid
                    });
                    if (parameters.position) {
                        state.core.setRegistry(child,
                            'position',
                            {
                                x: parameters.position.x || 100,
                                y: parameters.position.y || 100
                            });
                    } else {
                        state.core.setRegistry(child, 'position', {x: 100, y: 100});
                    }
                    storeNode(child);
                    newID = state.core.getPath(child);
                    msg = msg || 'createChild(' + parameters.parentId + ',' + parameters.baseId + ',' + newID + ')';
                    saveRoot(msg);
                }
            }

            return newID;
        }

        function makePointer(id, name, to, msg) {
            if (to === null) {
                state.core.setPointer(state.nodes[id].node, name, to);
            } else {


                state.core.setPointer(state.nodes[id].node, name, state.nodes[to].node);
            }

            msg = msg || 'makePointer(' + id + ',' + name + ',' + to + ')';
            saveRoot(msg);
        }

        function delPointer(path, name, msg) {
            if (state.core && state.nodes[path] && typeof state.nodes[path].node === 'object') {
                state.core.deletePointer(state.nodes[path].node, name);
                msg = msg || 'delPointer(' + path + ',' + name + ')';
                saveRoot(msg);
            }
        }


        //MGAlike - set functions
        function addMember(path, memberpath, setid, msg) {
            if (state.nodes[path] &&
                state.nodes[memberpath] &&
                typeof state.nodes[path].node === 'object' &&
                typeof state.nodes[memberpath].node === 'object') {
                state.core.addMember(state.nodes[path].node,
                    setid, state.nodes[memberpath].node);
                msg = msg || 'addMember(' + path + ',' + memberpath + ',' + setid + ')';
                saveRoot(msg);
            }
        }

        function removeMember(path, memberpath, setid, msg) {
            if (state.nodes[path] &&
                typeof state.nodes[path].node === 'object') {
                state.core.delMember(state.nodes[path].node, setid, memberpath);
                msg = msg || 'removeMember(' + path + ',' + memberpath + ',' + setid + ')';
                saveRoot(msg);
            }
        }

        function setMemberAttribute(path, memberpath, setid, name, value, msg) {
            if (state.nodes[path] && typeof state.nodes[path].node === 'object') {
                state.core.setMemberAttribute(state.nodes[path].node, setid, memberpath, name, value);
                msg = msg ||
                    'setMemberAttribute(' + path + ',' + memberpath + ',' + setid + ',' + name + ',' + value +
                    ')';
                saveRoot(msg);
            }
        }

        function delMemberAttribute(path, memberpath, setid, name, msg) {
            if (state.nodes[path] && typeof state.nodes[path].node === 'object') {
                state.core.delMemberAttribute(state.nodes[path].node, setid, memberpath, name);
                msg = msg || 'delMemberAttribute(' + path + ',' + memberpath + ',' + setid + ',' + name + ')';
                saveRoot(msg);
            }
        }

        function setMemberRegistry(path, memberpath, setid, name, value, msg) {
            if (state.nodes[path] && typeof state.nodes[path].node === 'object') {
                state.core.setMemberRegistry(state.nodes[path].node, setid, memberpath, name, value);
                msg = msg ||
                    'setMemberRegistry(' + path + ',' + memberpath + ',' + setid + ',' + name + ',' + value + ')';
                saveRoot(msg);
            }
        }

        function delMemberRegistry(path, memberpath, setid, name, msg) {
            if (state.nodes[path] && typeof state.nodes[path].node === 'object') {
                state.core.delMemberRegistry(state.nodes[path].node, setid, memberpath, name);
                msg = msg || 'delMemberRegistry(' + path + ',' + memberpath + ',' + setid + ',' + name + ')';
                saveRoot(msg);
            }
        }

        function createSet(path, setid, msg) {
            if (state.nodes[path] && typeof state.nodes[path].node === 'object') {
                state.core.createSet(state.nodes[path].node, setid);
                msg = msg || 'createSet(' + path + ',' + setid + ')';
                saveRoot(msg);
            }
        }

        function deleteSet(path, setid, msg) {
            if (state.nodes[path] && typeof state.nodes[path].node === 'object') {
                state.core.deleteSet(state.nodes[path].node, setid);
                msg = msg || 'deleteSet(' + path + ',' + setid + ')';
                saveRoot(msg);
            }
        }

        function setBase(path, basepath) {
            /*if (state.core &&
             state.nodes[path] && typeof state.nodes[path].node === 'object') {
             state.core.setRegistry(state.nodes[path].node,'base',basepath);
             saveRoot('setBase('+path+','+basepath+')');
             }*/
            if (state.core &&
                state.nodes[path] &&
                typeof state.nodes[path].node === 'object' &&
                state.nodes[basepath] &&
                typeof state.nodes[basepath].node === 'object') {
                state.core.setBase(state.nodes[path].node, state.nodes[basepath].node);
                saveRoot('setBase(' + path + ',' + basepath + ')');
            }
        }

        function delBase(path) {
            /*if (state.core &&
             state.nodes[path] && typeof state.nodes[path].node === 'object') {
             state.core.delRegistry(state.nodes[path].node,'base');
             saveRoot('delBase('+path+')');
             }*/
            if (state.core && state.nodes[path] && typeof state.nodes[path].node === 'object') {
                state.core.setBase(state.nodes[path].node, null);
                saveRoot('delBase(' + path + ')');
            }
        }

        return {
            setAttributes: setAttributes,
            delAttributes: delAttributes,
            setRegistry: setRegistry,
            delRegistry: delRegistry,
            copyMoreNodes: copyMoreNodes,
            moveMoreNodes: moveMoreNodes,
            delMoreNodes: delMoreNodes,
            createChild: createChild,
            createChildren: createChildren,
            makePointer: makePointer,
            delPointer: delPointer,
            addMember: addMember,
            removeMember: removeMember,
            setMemberAttribute: setMemberAttribute,
            delMemberAttribute: delMemberAttribute,
            setMemberRegistry: setMemberRegistry,
            delMemberRegistry: delMemberRegistry,
            createSet: createSet,
            deleteSet: deleteSet,

            setBase: setBase,
            delBase: delBase,
        };
    }

    return gmeNodeSetter;
});
/*globals define*/
/*jshint node: true, browser: true*/

/**
 * @author kecso / https://github.com/kecso
 */

define('common/core/users/serialization',['common/util/assert'], function (ASSERT) {

    
    var _nodes = {},
        _core = null,
        _pathToGuidMap = {},
        _guidKeys = [], //ordered list of GUIDs
        _extraBasePaths = {},
        _export = {},
        _import = {},
        _newNodeGuids = [],
        _removedNodeGuids = [],
        _updatedNodeGuids = [],
        _log = '';

    function log(txt) {
        if (_log) {
            _log += '\n' + txt;
        } else {
            _log = '' + txt;
        }
    }

    function exportLibrary(core, libraryRoot, callback) {
        //initialization
        _core = core;
        _nodes = {};
        _pathToGuidMap = {};
        _guidKeys = [];
        _extraBasePaths = {};
        _export = {};

        //loading all library element
        gatherNodesSlowly(libraryRoot, function (err) {
            if (err) {
                return callback(err);
            }

            _guidKeys = _guidKeys.sort();
            gatherAncestors(); //collecting the 'external' base classes - probably we should avoid these

            var keys = Object.keys(_extraBasePaths),
                i;
            _export.bases = {};
            for (i = 0; i < keys.length; i++) {
                _export.bases[_extraBasePaths[keys[i]]] = keys[i];
            }

            //_export.bases = _extraBasePaths;
            // we save this info alongside with the library export, to be on the safe side

            _export.root = getLibraryRootInfo(libraryRoot);
            _export.relids = getRelIdInfo();
            _export.containment = {};
            fillContainmentTree(libraryRoot, _export.containment);
            _export.nodes = getNodesData();

            //we export MetaSheet info only if not the whole project is exported!!!
            _export.metaSheets = core.getParent(libraryRoot) ? getMetaSheetInfo(_core.getRoot(libraryRoot)) : {};

            callback(null, _export);

        });
    }

    function getMetaSheetInfo(root) {
        var getMemberRegistry = function (setname, memberpath) {
                var names = _core.getMemberRegistryNames(root, setname, memberpath),
                    i,
                    registry = {};
                for (i = 0; i < names.length; i++) {
                    registry[names[i]] = _core.getMemberRegistry(root, setname, memberpath, names[i]);
                }
                return registry;
            },
            getMemberAttributes = function (setname, memberpath) {
                var names = _core.getMemberAttributeNames(root, setname, memberpath),
                    i,
                    attributes = {};
                for (i = 0; i < names.length; i++) {
                    attributes[names[i]] = _core.getMemberAttribute(root, setname, memberpath, names[i]);
                }
                return attributes;
            },
            getRegistryEntry = function (setname) {
                var index = registry.length;

                while (--index >= 0) {
                    if (registry[index].SetID === setname) {
                        return registry[index];
                    }
                }
                return {};
            },
            sheets = {},
            registry = _core.getRegistry(root, 'MetaSheets'),
            keys = _core.getSetNames(root),
            elements, guid,
            i,
            j;

        for (i = 0; i < keys.length; i++) {
            if (keys[i].indexOf('MetaAspectSet') === 0) {
                elements = _core.getMemberPaths(root, keys[i]);
                for (j = 0; j < elements.length; j++) {
                    guid = _pathToGuidMap[elements[j]] || _extraBasePaths[elements[j]];
                    if (guid) {
                        sheets[keys[i]] = sheets[keys[i]] || {};
                        sheets[keys[i]][guid] = {
                            registry: getMemberRegistry(keys[i], elements[j]),
                            attributes: getMemberAttributes(keys[i], elements[j])
                        };
                    }
                }

                if (sheets[keys[i]] && keys[i] !== 'MetaAspectSet') {
                    //we add the global registry values as well
                    sheets[keys[i]].global = getRegistryEntry(keys[i]);
                }
            }
        }
        console.log('sheets', sheets);
        return sheets;
    }

    function importMetaSheetInfo(root) {
        var setMemberAttributesAndRegistry = function (setname, memberguid) {
                var attributes = oldSheets[setname][memberguid].attributes || {},
                    registry = oldSheets[setname][memberguid].registry || {},
                    keys = Object.keys(attributes),
                    i;

                for (i = 0; i < keys.length; i++) {
                    _core.setMemberAttribute(root, setname, _core.getPath(_nodes[memberguid]), keys[i],
                        attributes[keys[i]]);
                }
                keys = Object.keys(registry);
                for (i = 0; i < keys.length; i++) {
                    _core.setMemberRegistry(root, setname, _core.getPath(_nodes[memberguid]), keys[i],
                        registry[keys[i]]);
                }
            },
            updateSheet = function (name) {
                //the removed object should be already removed...
                //if some element is extra in the place of import, then it stays untouched
                var oldMemberGuids = Object.keys(oldSheets[name]),
                    i;
                oldMemberGuids.splice(oldMemberGuids.indexOf('global'), 1);
                for (i = 0; i < oldMemberGuids.length; i++) {
                    _core.addMember(root, name, _nodes[oldMemberGuids[i]]);
                    setMemberAttributesAndRegistry(name, oldMemberGuids[i]);
                }
            },
            addSheet = function (name) {
                var registry = JSON.parse(JSON.stringify(_core.getRegistry(root, 'MetaSheets')) || {}),
                    i,
                    memberpath,
                    memberguids = Object.keys(oldSheets[name]);

                memberguids.splice(memberguids.indexOf('global'), 1);

                if (name !== 'MetaAspectSet') {
                    registry.push(oldSheets[name].global);
                    _core.setRegistry(root, 'MetaSheets', registry);
                }

                _core.createSet(root, name);
                for (i = 0; i < memberguids.length; i++) {
                    memberpath = _core.getPath(_nodes[memberguids[i]]);
                    _core.addMember(root, name, _nodes[memberguids[i]]);
                    setMemberAttributesAndRegistry(name, memberguids[i]);
                }
            },
            oldSheets = _import.metaSheets || {},
            newSheets = _export.metaSheets || {},
            oldSheetNames = Object.keys(oldSheets),
            newSheetNames = Object.keys(newSheets),
            i;

        for (i = 0; i < oldSheetNames.length; i++) {
            if (newSheetNames.indexOf(oldSheetNames[i]) !== -1) {
                updateSheet(oldSheetNames[i]);
            } else {
                addSheet(oldSheetNames[i]);
            }
        }
    }

    function getLibraryRootInfo(node) {
        return {
            path: _core.getPath(node),
            guid: _core.getGuid(node)
        };
    }

    function gatherNodesSlowly(node, callback) {
        _core.loadSubTree(node, function (err, nodes) {
            var guid, i;
            if (!err && nodes) {
                for (i = 0; i < nodes.length; i++) {
                    guid = _core.getGuid(nodes[i]);
                    _nodes[guid] = nodes[i];
                    _guidKeys.push(guid);
                    _pathToGuidMap[_core.getPath(nodes[i])] = guid;
                }
                callback(null);
            } else {
                callback(err);
            }
        });
    }

    function gatherAncestors() {
        //this function inserts the needed base classes which were not included in the library
        var i, base, guid;
        for (i = 0; i < _guidKeys.length; i++) {
            base = _nodes[_guidKeys[i]];
            while (base !== null) {
                guid = _core.getGuid(base);
                if (!_nodes[guid]) {
                    _nodes[guid] = base;
                    _extraBasePaths[_core.getPath(base)] = guid;
                } else if (_guidKeys.indexOf(guid) === -1) {
                    _extraBasePaths[_core.getPath(base)] = guid;
                }
                base = _core.getBase(base);
            }
        }
    }

    function pathsToSortedGuidList(pathsList) { //it will also filter out not wanted elements
        var i, guids = [];
        for (i = 0; i < pathsList.length; i++) {
            if (_pathToGuidMap[pathsList[i]]) {
                guids.push(_pathToGuidMap[pathsList[i]]);
            }
        }
        return guids.sort();
    }

    function fillContainmentTree(node, myTreeObject) {
        var childrenGuids = pathsToSortedGuidList(_core.getChildrenPaths(node)),
            i;
        for (i = 0; i < childrenGuids.length; i++) {
            myTreeObject[childrenGuids[i]] = {};
            fillContainmentTree(_nodes[childrenGuids[i]], myTreeObject[childrenGuids[i]]);
        }
    }

    function getRelIdInfo() {
        var i,
            relIdInfo = {};
        for (i = 0; i < _guidKeys.length; i++) {
            relIdInfo[_guidKeys[i]] = _core.getRelid(_nodes[_guidKeys[i]]);
        }
        return relIdInfo;
    }

    function getNodesData() {
        var data = {},
            i;
        for (i = 0; i < _guidKeys.length; i++) {
            data[_guidKeys[i]] = getNodeData(_nodes[_guidKeys[i]]);
        }
        return data;
    }

    function getNodeData(node) {
        /*{
         //only the ones defined on this level
         attributes:{name:value},
         base:GUID,
         registry:{name:value},
         parent:GUID,
         pointers:{name:targetGuid},
         sets:{name:[{guid:GUID,attributes:{name:value},registy:{name:value}}]}
         meta:{}
         }*/
        return {
            attributes: getAttributesOfNode(node),
            base: _core.getBase(node) ? _core.getGuid(_core.getBase(node)) : null,
            meta: pathsToGuids(JSON.parse(JSON.stringify(_core.getOwnJsonMeta(node)) || {})),
            parent: _core.getParent(node) ? _core.getGuid(_core.getParent(node)) : null,
            pointers: getPointersOfNode(node),
            registry: getRegistryOfNode(node),
            sets: getSetsOfNode(node),
            constraints: getConstraintsOfNode(node)
        };
    }

    function baseGuid(path) {
        /*var keys = Object.keys(_extraBasePaths),
         i;
         for(i=0;i<keys.length;i++){
         if(_extraBasePaths[keys[i]] === path){
         return keys[i];
         }
         }
         return null;*/
        return _extraBasePaths[path];
    }

    var sortMultipleArrays = function () {
        var index = getSortedIndex(arguments[0]);
        for (var j = 0; j < arguments.length; j++) {
            var _arr = arguments[j].slice();
            for (var i = 0; i < _arr.length; i++) {
                arguments[j][i] = _arr[index[i]];
            }
        }
    };

    var getSortedIndex = function (arr) {
        var index = [];
        for (var i = 0; i < arr.length; i++) {
            index.push(i);
        }
        index = index.sort((function (arr) {
            return function (a, b) {
                return ((arr[a] > arr[b]) ? 1 : ((arr[a] < arr[b]) ? -1 : 0));
            };
        })(arr));
        return index;
    };

    function pathsToGuids(jsonObject) {
        if (jsonObject && typeof jsonObject === 'object') {
            var keys = Object.keys(jsonObject),
                i, j, k, toDelete, tArray;

            for (i = 0; i < keys.length; i++) {
                if (keys[i] === 'items') {
                    //here comes the transformation itself
                    toDelete = [];
                    for (j = 0; j < jsonObject.items.length; j++) {
                        if (_pathToGuidMap[jsonObject.items[j]]) {
                            jsonObject.items[j] = _pathToGuidMap[jsonObject.items[j]];
                        } else if (baseGuid(jsonObject.items[j])) {
                            jsonObject.items[j] = baseGuid(jsonObject.items[j]);
                        } else {
                            toDelete.push(j);
                        }
                    }

                    if (toDelete.length > 0) {
                        toDelete = toDelete.sort();
                        toDelete = toDelete.reverse();
                        for (j = 0; j < toDelete.length; j++) {
                            jsonObject.items.splice(toDelete[j], 1);
                            jsonObject.minItems.splice(toDelete[j], 1);
                            jsonObject.maxItems.splice(toDelete[j], 1);
                        }
                    }
                    sortMultipleArrays(jsonObject.items, jsonObject.minItems, jsonObject.maxItems);
                } else if (keys[i] === 'aspects') {
                    //aspects are a bunch of named path list, so we have to handle them separately
                    tArray = Object.keys(jsonObject[keys[i]]);
                    for (j = 0; j < tArray.length; j++) {
                        //here comes the transformation itself
                        toDelete = [];
                        for (k = 0; k < jsonObject.aspects[tArray[j]].length; k++) {
                            if (_pathToGuidMap[jsonObject.aspects[tArray[j]][k]]) {
                                jsonObject.aspects[tArray[j]][k] = _pathToGuidMap[jsonObject.aspects[tArray[j]][k]];
                            } else if (baseGuid(jsonObject.aspects[tArray[j]][k])) {
                                jsonObject.aspects[tArray[j]][k] = baseGuid(jsonObject.aspects[tArray[j]][k]);
                            } else {
                                toDelete.push(k);
                            }
                        }

                        if (toDelete.length > 0) {
                            toDelete = toDelete.sort();
                            toDelete = toDelete.reverse();
                            for (k = 0; k < toDelete.length; k++) {
                                jsonObject.aspects[tArray[j]].splice(toDelete[k], 1);
                            }
                        }

                        jsonObject.aspects[tArray[j]] = jsonObject.aspects[tArray[j]].sort();

                    }
                } else {
                    if (typeof jsonObject[keys[i]] === 'object') {
                        jsonObject[keys[i]] = pathsToGuids(jsonObject[keys[i]]);
                    }
                }
            }

        }
        return jsonObject;
    }

    function getAttributesOfNode(node) {
        var names = _core.getOwnAttributeNames(node).sort(),
            i,
            result = {};
        for (i = 0; i < names.length; i++) {
            result[names[i]] = _core.getAttribute(node, names[i]);
        }
        return result;
    }

    function getRegistryOfNode(node) {
        var names = _core.getOwnRegistryNames(node).sort(),
            i,
            result = {};
        for (i = 0; i < names.length; i++) {
            result[names[i]] = _core.getRegistry(node, names[i]);
        }
        return result;
    }

    function getConstraintsOfNode(node) {
        var names = _core.getOwnConstraintNames(node).sort(),
            i,
            result = {};
        for (i = 0; i < names.length; i++) {
            result[names[i]] = _core.getConstraint(node, names[i]);
        }
        return result;
    }

    function getPointersOfNode(node) {
        var names = _core.getOwnPointerNames(node).sort(),
            i,
            result = {},
            target;
        for (i = 0; i < names.length; i++) {
            target = _core.getPointerPath(node, names[i]);
            if (_pathToGuidMap[target] || baseGuid(target) || target === null) {
                result[names[i]] = _pathToGuidMap[target] || baseGuid(target) || null;
            }
        }
        return result;
    }

    function getOwnMemberPaths(node, setName) {
        var base = _core.getBase(node),
            baseMembers = base === null ? [] : _core.getMemberPaths(base, setName),
            members = _core.getMemberPaths(node, setName),
            ownMembers = [],
            i;
        for (i = 0; i < members.length; i++) {
            if (baseMembers.indexOf(members[i]) === -1) {
                ownMembers.push(members[i]);
            }
        }
        return ownMembers;
    }

    function getSetsOfNode(node) {
        var names = _core.getSetNames(node).sort(),
            i, j, k,
            result = {},
            targetGuids,
            attributeNames,
            registryNames,
            memberInfo,
            path;
        for (i = 0; i < names.length; i++) {
            targetGuids = pathsToSortedGuidList(getOwnMemberPaths(node, names[i]));
            result[names[i]] = [];
            for (j = 0; j < targetGuids.length; j++) {
                path = _core.getPath(_nodes[targetGuids[j]]);
                memberInfo = {
                    attributes: {},
                    guid: targetGuids[j],
                    registry: {}
                };

                //attributes
                attributeNames = _core.getMemberAttributeNames(node, names[i], path).sort();
                for (k = 0; k < attributeNames.length; k++) {
                    memberInfo.attributes[attributeNames[k]] =
                        _core.getMemberAttribute(node, names[i], path, attributeNames[k]);
                }

                //registry
                registryNames = _core.getMemberRegistryNames(node, names[i], path).sort();
                for (k = 0; k < registryNames.length; k++) {
                    memberInfo.registry[registryNames[k]] =
                        _core.getMemberRegistry(node, names[i], path, registryNames[k]);
                }

                result[names[i]].push(memberInfo);
            }
        }
        return result;
    }

    function logId(nodes, id) {
        var txtId = id + '';
        if (nodes[id] && nodes[id].attributes && nodes[id].attributes.name) {
            txtId = nodes[id].attributes.name + '(' + id + ')';
        }

        return txtId;
    }

    function loadImportBases(guids, root, callback) {
        var needed = [],
            error = null,
            stillToGo = 0,
            i,
            guidList = Object.keys(guids),
            loadBase = function (guid, path, cb) {
                _core.loadByPath(root, path, function (err, node) {
                    if (err) {
                        return cb(err);
                    }
                    if (_core.getGuid(node) !== guid) {
                        return cb('GUID mismatch');
                    }

                    _nodes[guid] = node;
                    cb(null);
                });
            };

        for (i = 0; i < guidList.length; i++) {
            if (_nodes[guidList[i]] === undefined) {
                needed.push(guidList[i]);
            }
        }

        if (needed.length > 0) {
            stillToGo = needed.length;
            for (i = 0; i < needed.length; i++) {
                loadBase(needed[i], guids[needed[i]], function (err) {
                    error = error || err;
                    if (--stillToGo === 0) {
                        callback(error);
                    }
                });
            }
        } else {
            return callback(null);
        }

    }

    function importLibrary(core, originLibraryRoot, updatedLibraryJson, callback) {
        _core = core;
        _import = updatedLibraryJson;
        _newNodeGuids = [];
        _updatedNodeGuids = [];
        _removedNodeGuids = [];
        _log = '';

        synchronizeRoots(originLibraryRoot, _import.root.guid);
        exportLibrary(core, originLibraryRoot, function (err) {
            //we do not need the returned json object as that is stored in our global _export variable
            if (err) {
                return callback(err);
            }

            //now we will search for the bases of the import and load them
            loadImportBases(_import.bases, _core.getRoot(originLibraryRoot), function (err) {
                if (err) {
                    return callback(err);
                }

                //now we fill the insert/update/remove lists of GUIDs
                var oldkeys = Object.keys(_export.nodes),
                    newkeys = Object.keys(_import.nodes),
                    i;

                //TODO now we make three rounds although one would be sufficient on ordered lists
                for (i = 0; i < oldkeys.length; i++) {
                    if (newkeys.indexOf(oldkeys[i]) === -1) {
                        log('node ' + logId(_export.nodes, oldkeys[i]) +
                        ', all of its sub-types and its children will be removed');

                        _removedNodeGuids.push(oldkeys[i]);
                    }
                }

                for (i = 0; i < oldkeys.length; i++) {
                    if (newkeys.indexOf(oldkeys[i]) !== -1) {
                        log('node ' + logId(_export.nodes, oldkeys[i]) + ' will be updated');
                        _updatedNodeGuids.push(oldkeys[i]);
                    }
                }

                for (i = 0; i < newkeys.length; i++) {
                    if (oldkeys.indexOf(newkeys[i]) === -1) {
                        log('node ' + logId(_import.nodes, newkeys[i]) + ' will be added');
                        _newNodeGuids.push(newkeys[i]);
                    }
                }

                //Now we normalize the removedGUIDs by containment and remove them
                var toDelete = [],
                    parent;
                for (i = 0; i < _removedNodeGuids.length; i++) {
                    parent = _core.getParent(_nodes[_removedNodeGuids[i]]);
                    if (parent && _removedNodeGuids.indexOf(_core.getGuid(parent)) === -1) {
                        toDelete.push(_removedNodeGuids[i]);
                    }
                }
                //and as a final step we remove all that is needed
                for (i = 0; i < toDelete.length; i++) {
                    _core.deleteNode(_nodes[toDelete[i]]);
                }

                //as a second step we should deal with the updated nodes
                //we should go among containment hierarchy
                updateNodes(_import.root.guid, null, _import.containment);

                //now update inheritance chain
                //we assume that our inheritance chain comes from the FCO and that it is identical everywhere
                updateInheritance();

                //now we can add or modify the relations of the nodes - we go along the hierarchy chain
                updateRelations();

                //finally we need to update the meta rules of each node - again along the containment hierarchy
                updateMetaRules(_import.root.guid, _import.containment);

                //after everything is done we try to synchronize the metaSheet info
                importMetaSheetInfo(_core.getRoot(originLibraryRoot));

                callback(null, _log);
            });
        });
    }

    function synchronizeRoots(oldRoot, newGuid) {
        _core.setGuid(oldRoot, newGuid);
    }

    //it will update the modified nodes and create the new ones regarding their place in the hierarchy chain
    function updateNodes(guid, parent, containmentTreeObject) {
        if (_updatedNodeGuids.indexOf(guid) !== -1) {
            updateNode(guid, parent);
        }

        var keys = Object.keys(containmentTreeObject),
            i,
            node = _nodes[guid],
            relid;

        for (i = 0; i < keys.length; i++) {
            if (_updatedNodeGuids.indexOf(keys[i]) === -1) {
                relid = _import.relids[keys[i]];
                if (_core.getChildrenRelids(node).indexOf(relid) !== -1) {
                    relid = undefined;
                }
                //this child is a new one so we should create
                _nodes[keys[i]] = _core.createNode({parent: node, guid: keys[i], relid: relid});
                addNode(keys[i]);
            }
            updateNodes(keys[i], node, containmentTreeObject[keys[i]]);
        }
    }

    function updateRegistry(guid) {
        var keys, i,
            node = _nodes[guid],
            jsonNode = _import.nodes[guid];

        keys = _core.getOwnRegistryNames(node);
        for (i = 0; i < keys.length; i++) {
            _core.delRegistry(node, keys[i]);
        }
        keys = Object.keys(jsonNode.registry);
        for (i = 0; i < keys.length; i++) {
            _core.setRegistry(node, keys[i], jsonNode.registry[keys[i]]);
        }
    }

    function updateAttributes(guid) {
        var keys, i,
            node = _nodes[guid],
            jsonNode = _import.nodes[guid];

        keys = _core.getOwnAttributeNames(node);
        for (i = 0; i < keys.length; i++) {
            _core.delAttribute(node, keys[i]);
        }
        keys = Object.keys(jsonNode.attributes);
        for (i = 0; i < keys.length; i++) {
            _core.setAttribute(node, keys[i], jsonNode.attributes[keys[i]]);
        }
    }

    function updateConstraints(guid) {
        var keys, i,
            node = _nodes[guid],
            jsonNode = _import.nodes[guid];
        keys = _core.getOwnConstraintNames(node);
        for (i = 0; i < keys.length; i++) {
            _core.delConstraint(node, keys[i]);
        }

        keys = Object.keys(jsonNode.constraints || {});
        for (i = 0; i < keys.length; i++) {
            _core.setConstraint(node, keys[i], jsonNode.constraints[keys[i]]);
        }
    }

    //this function does not cover relations - it means only attributes and registry have been updated here
    function updateNode(guid, parent) {
        //first we check if the node have to be moved
        var node = _nodes[guid];

        if (parent && _core.getParent(node) && _core.getGuid(parent) !== _core.getGuid(_core.getParent(node))) {
            //parent changed so it has to be moved...
            _nodes[guid] = _core.moveNode(node, parent);
        }

        updateAttributes(guid);
        updateRegistry(guid);
        updateConstraints(guid);
    }

    //this function doesn't not cover relations - so only attributes and registry have been taken care of here
    function addNode(guid) {
        //at this point we assume that an empty vessel has been already created and part of the _nodes
        updateAttributes(guid);
        updateRegistry(guid);
        updateConstraints(guid);
    }

    function getInheritanceBasedGuidOrder() {
        var inheritanceOrdered = Object.keys(_import.nodes).sort(),
            i = 0,
            baseGuid,
            baseIndex;

        while (i < inheritanceOrdered.length) {
            baseGuid = _import.nodes[inheritanceOrdered[i]].base;
            if (baseGuid) {
                baseIndex = inheritanceOrdered.indexOf(baseGuid);
                if (baseIndex > i) {
                    inheritanceOrdered.splice(baseIndex, 1);
                    inheritanceOrdered.splice(i, 0, baseGuid);
                } else {
                    ++i;
                }
            } else {
                ++i;
            }
        }
        return inheritanceOrdered;
    }

    function updateRelations() {
        var guids = getInheritanceBasedGuidOrder(),
            i;
        for (i = 0; i < guids.length; i++) {
            updateNodeRelations(guids[i]);
        }
    }

    function updateNodeRelations(guid) {
        // Although it is possible that we set the base pointer at this point
        // we should go through inheritance just to be sure.
        var node = _nodes[guid],
            jsonNode = _import.nodes[guid],
            keys, i, j, k, target, memberGuid;

        //pointers
        keys = _core.getOwnPointerNames(node);
        for (i = 0; i < keys.length; i++) {
            _core.deletePointer(node, keys[i]);
        }
        keys = Object.keys(jsonNode.pointers);
        for (i = 0; i < keys.length; i++) {
            target = jsonNode.pointers[keys[i]];
            if (target === null) {
                _core.setPointer(node, keys[i], null);
            } else if (_nodes[target] && _removedNodeGuids.indexOf(target) === -1) {
                _core.setPointer(node, keys[i], _nodes[target]);
            } else {
                console.log('error handling needed???!!!???');
            }
        }

        //sets
        keys = _core.getSetNames(node);
        for (i = 0; i < keys.length; i++) {
            _core.deleteSet(node, keys[i]);
        }
        keys = Object.keys(jsonNode.sets);
        for (i = 0; i < keys.length; i++) {
            //for every set we create it, go through its members...
            _core.createSet(node, keys[i]);
            for (j = 0; j < jsonNode.sets[keys[i]].length; j++) {
                memberGuid = jsonNode.sets[keys[i]][j].guid;
                if (_nodes[memberGuid]) {
                    _core.addMember(node, keys[i], _nodes[memberGuid]);
                    for (k in jsonNode.sets[keys[i]][j].attributes) {
                        _core.setMemberAttribute(node, keys[i], _core.getPath(_nodes[memberGuid]), k,
                            jsonNode.sets[keys[i]][j].attributes[k]);
                    }
                    for (k in jsonNode.sets[keys[i]][j].registry) {
                        _core.setMemberRegistry(node, keys[i], _core.getPath(_nodes[memberGuid]), k,
                            jsonNode.sets[keys[i]][j].registry[k]);
                    }
                }
            }
        }
    }

    function updateInheritance() {
        var i,
            guidList = Object.keys(_import.nodes),
            base;
        for (i = 0; i < guidList.length; i++) {
            base = _core.getBase(_nodes[guidList[i]]);
            if ((base && _core.getGuid(base) !== _import.nodes[guidList[i]].base) ||
                (base === null && _import.nodes[guidList[i]].base !== null)) {

                updateNodeInheritance(guidList[i]);
            }
        }
    }

    function updateNodeInheritance(guid) {
        _core.setBase(_nodes[guid], _nodes[_import.nodes[guid].base]);
    }

    function updateMetaRules(guid, containmentTreeObject) {

        var keys, i;

        updateMeta(guid);

        keys = Object.keys(containmentTreeObject);
        for (i = 0; i < keys.length; i++) {
            updateMetaRules(keys[i], containmentTreeObject[keys[i]]);
        }
    }

    function updateMeta(guid) {
        _core.clearMetaRules(_nodes[guid]);

        updateAttributeMeta(guid);
        updateChildrenMeta(guid);
        updatePointerMeta(guid);
        updateAspectMeta(guid);
        updateConstraintMeta(guid);
    }

    function updateAttributeMeta(guid) {
        var jsonMeta = _import.nodes[guid].meta.attributes || {},
            node = _nodes[guid],
            keys, i;

        keys = Object.keys(jsonMeta);
        for (i = 0; i < keys.length; i++) {
            _core.setAttributeMeta(node, keys[i], jsonMeta[keys[i]]);
        }
    }

    function updateChildrenMeta(guid) {
        var jsonMeta = _import.nodes[guid].meta.children || {items: [], minItems: [], maxItems: []},
            i;
        ASSERT(jsonMeta.items.length === jsonMeta.minItems.length &&
        jsonMeta.minItems.length === jsonMeta.maxItems.length);

        _core.setChildrenMetaLimits(_nodes[guid], jsonMeta.min, jsonMeta.max);
        for (i = 0; i < jsonMeta.items.length; i++) {
            _core.setChildMeta(_nodes[guid], _nodes[jsonMeta.items[i]], jsonMeta.minItems[i], jsonMeta.maxItems[i]);
        }
    }

    function updatePointerMeta(guid) {
        var jsonMeta = _import.nodes[guid].meta.pointers || {},
            keys = Object.keys(jsonMeta),
            i, j;

        for (i = 0; i < keys.length; i++) {
            ASSERT(jsonMeta[keys[i]].items.length === jsonMeta[keys[i]].minItems.length &&
            jsonMeta[keys[i]].maxItems.length === jsonMeta[keys[i]].minItems.length);

            for (j = 0; j < jsonMeta[keys[i]].items.length; j++) {
                _core.setPointerMetaTarget(_nodes[guid], keys[i], _nodes[jsonMeta[keys[i]].items[j]],
                    jsonMeta[keys[i]].minItems[j], jsonMeta[keys[i]].maxItems[j]);
            }
            _core.setPointerMetaLimits(_nodes[guid], keys[i], jsonMeta[keys[i]].min, jsonMeta[keys[i]].max);
        }
    }

    function updateAspectMeta(guid) {
        var jsonMeta = _import.nodes[guid].meta.aspects || {},
            keys = Object.keys(jsonMeta),
            i, j;

        for (i = 0; i < keys.length; i++) {
            for (j = 0; j < jsonMeta[keys[i]].length; j++) {
                _core.setAspectMetaTarget(_nodes[guid], keys[i], _nodes[jsonMeta[keys[i]][j]]);
            }
        }
    }

    function updateConstraintMeta(guid) {
        var jsonMeta = _import.nodes[guid].meta.constraints || {},
            keys = Object.keys(jsonMeta),
            i;

        for (i = 0; i < keys.length; i++) {
            _core.setConstraint(_nodes[guid], keys[i], jsonMeta[keys[i]]);
        }
    }

    return {
        export: exportLibrary,
        import: importLibrary
    };
});

/*globals define*/
/*jshint browser: true*/
/**
 * @author kecso / https://github.com/kecso
 */
define('js/client/addon',[], function () {
    

    function AddOn(state, storage, logger__, gmeConfig) {
        var _addOns = {},
            logger = logger__.fork('addOn'),
            _constraintCallback = function () {
            };
        //addOn functions
        function startAddOn(name) {
            if (_addOns[name] === undefined) {
                _addOns[name] = 'loading';
                logger.debug('loading addOn ' + name);
                storage.simpleRequest({
                        command: 'connectedWorkerStart',
                        workerName: name,
                        project: state.project.name,
                        branch: state.branchName
                    },
                    function (err, id) {
                        if (err) {
                            logger.error('starting addon failed ' + err);
                            delete _addOns[name];
                            return logger.error(err);
                        }

                        logger.debug('started addon ' + name + ' ' + id);
                        _addOns[name] = id;
                    });
            }

        }

        function queryAddOn(name, query, callback) {
            if (!_addOns[name] || _addOns[name] === 'loading') {
                return callback(new Error('no such addOn is ready for queries'));
            }
            storage.simpleQuery(_addOns[name], query, callback);
        }

        function stopAddOn(name, callback) {
            if (_addOns[name] && _addOns[name] !== 'loading') {
                storage.simpleResult(_addOns[name], callback);
                delete _addOns[name];
            } else {
                callback(_addOns[name] ? new Error('addon loading') : null);
            }
        }

        //generic project related addOn handling
        function updateRunningAddOns(root) {
            var i,
                neededAddOns,
                runningAddOns,
                callback = function (err) {
                    logger.error(err);
                };

            if (gmeConfig.addOn.enable === true) {
                neededAddOns = state.core.getRegistry(root, 'usedAddOns');
                runningAddOns = getRunningAddOnNames();
                neededAddOns = neededAddOns ? neededAddOns.split(' ') : [];
                for (i = 0; i < neededAddOns.length; i += 1) {
                    if (!_addOns[neededAddOns[i]]) {
                        startAddOn(neededAddOns[i]);
                    }
                }
                for (i = 0; i < runningAddOns.length; i += 1) {
                    if (neededAddOns.indexOf(runningAddOns[i]) === -1) {
                        stopAddOn(runningAddOns[i], callback);
                    }
                }
            }
        }

        function stopRunningAddOns() {
            var i,
                keys,
                callback;

            if (gmeConfig.addOn.enable === true) {
                keys = Object.keys(_addOns);
                callback = function (err) {
                    if (err) {
                        logger.error('stopAddOn' + err);
                    }
                };

                for (i = 0; i < keys.length; i++) {
                    stopAddOn(keys[i], callback);
                }
            }
        }

        function getRunningAddOnNames() {
            var i,
                names = [],
                keys = Object.keys(_addOns);
            for (i = 0; i < keys.length; i++) {
                if (_addOns[keys[i]] !== 'loading') {
                    names.push(keys[i]);
                }
            }
            return names;
        }

        //core addOns
        //history
        function getDetailedHistoryAsync(callback) {
            if (_addOns.hasOwnProperty('HistoryAddOn') && _addOns.HistoryAddOn !== 'loading') {
                queryAddOn('HistoryAddOn', {}, callback);
            } else {
                callback(new Error('history information is not available'));
            }
        }

        //constraint
        function validateProjectAsync(callback) {
            callback = callback || _constraintCallback || function (/*err, result*/) {
                };
            if (_addOns.hasOwnProperty('ConstraintAddOn') && _addOns.ConstraintAddOn !== 'loading') {
                queryAddOn('ConstraintAddOn', {querytype: 'checkProject'}, callback);
            } else {
                callback(new Error('constraint checking is not available'));
            }
        }

        function validateModelAsync(path, callback) {
            callback = callback || _constraintCallback || function (/* err, result */) {
                };
            if (_addOns.hasOwnProperty('ConstraintAddOn') && _addOns.ConstraintAddOn !== 'loading') {
                queryAddOn('ConstraintAddOn', {querytype: 'checkModel', path: path}, callback);
            } else {
                callback(new Error('constraint checking is not available'));
            }
        }

        function validateNodeAsync(path, callback) {
            callback = callback || _constraintCallback || function (/* err, result */) {
                };
            if (_addOns.hasOwnProperty('ConstraintAddOn') && _addOns.ConstraintAddOn !== 'loading') {
                queryAddOn('ConstraintAddOn', {querytype: 'checkNode', path: path}, callback);
            } else {
                callback(new Error('constraint checking is not available'));
            }
        }

        function setValidationCallback(cFunction) {
            if (typeof cFunction === 'function' || cFunction === null) {
                _constraintCallback = cFunction;
            }
        }

        //core addOns end

        return {
            startAddOn: startAddOn,
            queryAddOn: queryAddOn,
            stopAddOn: stopAddOn,
            updateRunningAddOns: updateRunningAddOns,
            stopRunningAddOns: stopRunningAddOns,
            getDetailedHistoryAsync: getDetailedHistoryAsync,
            validateProjectAsync: validateProjectAsync,
            validateModelAsync: validateModelAsync,
            validateNodeAsync: validateNodeAsync,
            setValidationCallback: setValidationCallback,
            getRunningAddOnNames: getRunningAddOnNames
        };
    }

    return AddOn;
});
/*globals define*/
/*jshint browser: true*/
/**
 * @author kecso / https://github.com/kecso
 * @author pmeijer / https://github.com/pmeijer
 */
define('client/js/client',[
    'js/logger',
    'common/storage/browserstorage',
    'common/EventDispatcher',
    'common/core/core',
    'js/client/constants',
    'common/core/users/meta',
    'common/util/assert',
    'common/core/tasync',
    'common/util/guid',
    'common/util/url',
    'js/client/gmeNodeGetter',
    'js/client/gmeNodeSetter',
    'common/core/users/serialization',
    'js/client/addon'
], function (Logger,
             Storage,
             EventDispatcher,
             Core,
             CONSTANTS,
             META,
             ASSERT,
             TASYNC,
             GUID,
             URL,
             getNode,
             getNodeSetters,
             Serialization,
             AddOn) {
    

    function Client(gmeConfig) {
        var self = this,
            logger = Logger.create('gme:client', gmeConfig.client.log),
            storage = Storage.getStorage(logger, gmeConfig, true),
            state = {
                connection: null, // CONSTANTS.STORAGE. CONNECTED/DISCONNECTED/RECONNECTED
                project: null, //CONSTANTS.BRANCH_STATUS. SYNCH/FORKED/AHEAD/PULLING
                core: null,
                branchName: null,
                branchStatus: null,
                inSync: true,
                readOnlyProject: false,
                viewer: false, // This means that a specific commit is selected w/o regards to any branch.

                users: {},
                nodes: {},
                loadNodes: {},
                // FIXME: This should be the same as nodes (need to make sure they are not modified in meta).
                metaNodes: {},

                root: {
                    current: null,
                    previous: null,
                    object: null
                },
                commit: {
                    current: null,
                    previous: null
                },
                undoRedoChain: null, //{commit: '#hash', root: '#hash', previous: object, next: object}
                inTransaction: false,
                msg: '',
                gHash: 0,
                loadError: null
            },
            monkeyPatchKey,
            nodeSetterFunctions,
            addOnFunctions = new AddOn(state, storage, logger, gmeConfig);

        EventDispatcher.call(this);

        this.CONSTANTS = CONSTANTS;

        function logState(level, msg) {
            var lightState;

            function replacer(key, value) {
                var chainItem,
                    prevChain,
                    nextChain,
                    chain;
                if (key === 'project') {
                    if (value) {
                        return value.name;
                    } else {
                        return null;
                    }

                } else if (key === 'core') {
                    if (value) {
                        return 'instantiated';
                    } else {
                        return 'notInstantiated';
                    }
                } else if (key === 'metaNodes') {
                    return Object.keys(value);
                } else if (key === 'nodes') {
                    return Object.keys(value);
                } else if (key === 'loadNodes') {
                    return Object.keys(value);
                } else if (key === 'users') {
                    return Object.keys(value);
                } else if (key === 'root') {
                    return {
                        current: value.current,
                        previous: value.previous
                    };
                } else if (key === 'undoRedoChain') {
                    if (value) {
                        chain = {
                            previous: null,
                            next: null
                        };
                        if (value.previous) {
                            prevChain = {};
                            chain.previous = prevChain;
                        }
                        chainItem = value;
                        while (chainItem.previous) {
                            prevChain.previous = {
                                commit: chainItem.commit,
                                previous: null
                            };
                            prevChain = prevChain.previous;
                            chainItem = chainItem.previous;
                        }
                        if (value.next) {
                            nextChain = {};
                            chain.next = nextChain;
                        }
                        chainItem = value;
                        while (chainItem.next) {
                            nextChain.next = {
                                commit: chainItem.commit,
                                next: null
                            };
                            nextChain = nextChain.next;
                            chainItem = chainItem.next;
                        }
                        return chain;
                    }
                }

                return value;
            }

            if (gmeConfig.debug) {
                logger[level]('state at ' + msg, JSON.stringify(state, replacer, 2));
            } else {
                lightState = {
                    connection: self.getNetworkStatus(),
                    projectName: self.getActiveProjectName(),
                    branchName: self.getActiveBranchName(),
                    branchStatus: self.getBranchStatus(),
                    commitHash: self.getActiveCommitHash(),
                    rootHash: self.getActiveRootHash(),
                    projectReadOnly: self.isProjectReadOnly(),
                    commitReadOnly: self.isCommitReadOnly()
                };
                logger[level]('state at ' + msg, JSON.stringify(lightState));
            }
        }

        // Forwarded functions
        function saveRoot(msg, callback) {
            var persisted,
                numberOfPersistedObjects,
                beforeLoading = true,
                commitQueue,
                newCommitObject;
            logger.debug('saveRoot msg', msg);

            callback = callback || function () {
                };
            if (!state.viewer && !state.readOnlyProject) {
                if (state.msg) {
                    state.msg += '\n' + msg;
                } else {
                    state.msg += msg;
                }
                if (!state.inTransaction) {
                    ASSERT(state.project && state.core && state.branchName);
                    logger.debug('is NOT in transaction - will persist.');
                    persisted = state.core.persist(state.nodes[ROOT_PATH].node);
                    logger.debug('persisted', persisted);
                    numberOfPersistedObjects = Object.keys(persisted.objects).length;
                    if (numberOfPersistedObjects === 0) {
                        logger.warn('No changes after persist will return from saveRoot.');
                        callback(null);
                        return;
                    } else if (numberOfPersistedObjects > 200) {
                        //This is just for debugging
                        logger.warn('Lots of persisted objects', numberOfPersistedObjects);
                    }

                    // Calling event-listeners (users)
                    // N.B. it is no longer waiting for the setBranchHash to return from server.
                    // Which also was the case before:
                    // https://github.com/webgme/webgme/commit/48547c33f638aedb60866772ca5638f9e447fa24

                    loading(persisted.rootHash, function (err) {
                        if (err) {
                            logger.error('Saveroot - loading failed', err);
                        }
                        // TODO: Are local updates really guaranteed to be synchronous?
                        if (beforeLoading === false) {
                            logger.error('SaveRoot - was not synchronous!');
                        }
                    });

                    beforeLoading = false;
                    newCommitObject = storage.makeCommit(
                        state.project.name,
                        state.branchName,
                        [state.commit.current],
                        persisted.rootHash,
                        persisted.objects,
                        state.msg,
                        callback
                    );
                    commitQueue = state.project.getBranch(state.branchName, true).getCommitQueue();
                    if (state.inSync === true) {
                        changeBranchStatus(CONSTANTS.BRANCH_STATUS.AHEAD_SYNC, commitQueue);
                    } else {
                        changeBranchStatus(CONSTANTS.BRANCH_STATUS.AHEAD_NOT_SYNC, commitQueue);
                    }


                    addCommit(newCommitObject[CONSTANTS.STORAGE.MONGO_ID]);
                    //undo-redo
                    addModification(newCommitObject, false);
                    self.dispatchEvent(CONSTANTS.UNDO_AVAILABLE, canUndo());
                    self.dispatchEvent(CONSTANTS.REDO_AVAILABLE, canRedo());

                    state.msg = '';
                } else {
                    logger.debug('is in transaction - will NOT persist.');
                }
            } else {
                //TODO: Why is this set to empty here?
                state.msg = '';
                callback(null);
            }
        }

        function storeNode(node /*, basic */) {
            var path;
            //basic = basic || true;
            if (node) {
                path = state.core.getPath(node);
                state.metaNodes[path] = node;
                if (state.nodes[path]) {
                    //TODO we try to avoid this
                } else {
                    state.nodes[path] = {node: node, hash: ''/*,incomplete:true,basic:basic*/};
                    //TODO this only needed when real eventing will be reintroduced
                    //_inheritanceHash[path] = getInheritanceChain(node);
                }
                return path;
            }
            return null;
        }

        // Monkey patching from other files..
        this.meta = new META();

        for (monkeyPatchKey in this.meta) {
            //TODO: These should be accessed via this.meta.
            //TODO: e.g. client.meta.getMetaAspectNames(id) instead of client.getMetaAspectNames(id)
            //TODO: However that will break a lot since it's used all over the place...
            if (this.meta.hasOwnProperty(monkeyPatchKey)) {
                self[monkeyPatchKey] = this.meta[monkeyPatchKey];
            }
        }

        nodeSetterFunctions = getNodeSetters(logger, state, saveRoot, storeNode);

        for (monkeyPatchKey in nodeSetterFunctions) {
            if (nodeSetterFunctions.hasOwnProperty(monkeyPatchKey)) {
                self[monkeyPatchKey] = nodeSetterFunctions[monkeyPatchKey];
            }
        }

        // Main API functions (with helpers) for connecting, selecting project and branches etc.
        this.connectToDatabase = function (callback) {
            if (isConnected()) {
                logger.warn('connectToDatabase - already connected');
                callback(null);
                return;
            }
            storage.open(function (connectionState) {
                state.connection = connectionState;
                if (connectionState === CONSTANTS.STORAGE.CONNECTED) {
                    //N.B. this event will only be triggered once.
                    self.dispatchEvent(CONSTANTS.NETWORK_STATUS_CHANGED, connectionState);
                    reLaunchUsers();
                    callback(null);
                } else if (connectionState === CONSTANTS.STORAGE.DISCONNECTED) {
                    self.dispatchEvent(CONSTANTS.NETWORK_STATUS_CHANGED, connectionState);
                } else if (connectionState === CONSTANTS.STORAGE.RECONNECTED) {
                    self.dispatchEvent(CONSTANTS.NETWORK_STATUS_CHANGED, connectionState);
                } else { //CONSTANTS.ERROR
                    callback(Error('Connection failed!' + connectionState));
                }
            });
        };

        this.disconnectFromDatabase = function (callback) {

            function closeStorage(err) {
                storage.close(function (err2) {
                    state.connection = CONSTANTS.STORAGE.DISCONNECTED;
                    callback(err || err2);
                });
            }

            if (isConnected()) {
                if (state.project) {
                    closeProject(state.project.name, closeStorage);
                } else {
                    closeStorage(null);
                }
            } else {
                logger.warn('Trying to disconnect when already disconnected.');
                callback(null);
            }
        };

        this.selectProject = function (projectName, callback) {
            if (isConnected() === false) {
                callback(new Error('There is no open database connection!'));
            }
            var prevProjectName,
                branchToOpen = 'master';

            function projectOpened(err, project, branches, access) {
                if (err) {
                    callback(new Error(err));
                    return;
                }
                state.project = project;
                state.readOnlyProject = access.write === false;
                state.core = new Core(project, {
                    globConf: gmeConfig,
                    logger: logger.fork('core')
                });
                self.meta.initialize(state.core, state.metaNodes, saveRoot);
                logState('info', 'projectOpened');
                self.dispatchEvent(CONSTANTS.PROJECT_OPENED, projectName);

                if (branches.hasOwnProperty('master') === false) {
                    branchToOpen = Object.keys(branches)[0] || null;
                    logger.debug('Project "' + projectName + '" did not have a master branch, picked:', branchToOpen);
                }
                ASSERT(branchToOpen, 'No branch avaliable in project'); // TODO: Deal with this
                self.selectBranch(branchToOpen, null, function (err) {
                    if (err) {
                        callback(err);
                        return;
                    }
                    logState('info', 'selectBranch');
                    reLaunchUsers();
                    callback(null);
                });
            }

            if (state.project) {
                prevProjectName = state.project.name;
                logger.debug('A project was open, closing it', prevProjectName);

                if (prevProjectName === projectName) {
                    logger.warn('projectName is already opened', projectName);
                    callback(null);
                    return;
                }
                closeProject(prevProjectName, function (err) {
                    if (err) {
                        logger.error('problems closing previous project', err);
                        callback(err);
                        return;
                    }
                    storage.openProject(projectName, projectOpened);
                });
            } else {
                storage.openProject(projectName, projectOpened);
            }
        };

        function closeProject(projectName, callback) {
            state.project = null;
            //TODO what if for some reason we are in transaction?
            storage.closeProject(projectName, function (err) {
                if (err) {
                    callback(err);
                    return;
                }
                state.core = null;
                state.branchName = null;
                changeBranchStatus(null);
                state.patterns = {};
                //state.gHash = 0;
                state.nodes = {};
                state.metaNodes = {};
                state.loadNodes = {};
                state.loadError = 0;
                state.root.current = null;
                state.root.previous = null;
                //state.root.object = null;
                state.inTransaction = false;
                state.msg = '';

                cleanUsersTerritories();
                self.dispatchEvent(CONSTANTS.PROJECT_CLOSED, projectName);
                callback(null);
            });
        }

        /**
         *
         * @param {string} branchName - name of branch to open.
         * @param {function} [commitHandler=getDefaultCommitHandler()] - Handles returned statuses after commits.
         * @param callback
         */
        this.selectBranch = function (branchName, commitHandler, callback) {
            logger.debug('selectBranch', branchName);
            if (isConnected() === false) {
                callback(new Error('There is no open database connection!'));
                return;
            }
            if (!state.project) {
                callback(new Error('selectBranch invoked without an opened project'));
                return;
            }

            var prevBranchName = state.branchName;

            function openBranch(err) {
                if (err) {
                    logger.error('Problems closing existing branch', err);
                    callback(err);
                    return;
                }
                commitHandler = commitHandler || getDefaultCommitHandler();
                storage.openBranch(state.project.name, branchName, getUpdateHandler(), commitHandler,
                    function (err, latestCommit) {
                        var commitObject;
                        if (err) {
                            logger.error('storage.openBranch returned with error', err);
                            callback(new Error(err));
                            return;
                        }

                        commitObject = latestCommit.commitObject;
                        logger.debug('Branch opened latestCommit', latestCommit);

                        //undo-redo
                        logger.debug('changing branch - cleaning undo-redo chain');
                        addModification(commitObject, true);
                        self.dispatchEvent(CONSTANTS.UNDO_AVAILABLE, canUndo());
                        self.dispatchEvent(CONSTANTS.REDO_AVAILABLE, canRedo());

                        state.viewer = false;
                        state.branchName = branchName;
                        self.dispatchEvent(CONSTANTS.BRANCH_CHANGED, branchName);
                        logState('info', 'openBranch');

                        loading(commitObject.root, function (err) {
                            if (err) {
                                logger.error('loading failed after opening branch', branchName);
                            } else {
                                addCommit(commitObject[CONSTANTS.STORAGE.MONGO_ID]);
                            }
                            changeBranchStatus(CONSTANTS.BRANCH_STATUS.SYNC);
                            // TODO: Make sure this is always the case.
                            callback(err);
                        });

                    }
                );
            }

            if (state.branchName !== null) {
                logger.debug('Branch was open, closing it first', state.branchName);
                prevBranchName = state.branchName;
                storage.closeBranch(state.project.name, prevBranchName, openBranch);
            } else {
                openBranch(null);
            }
        };

        this.selectCommit = function (commitHash, callback) {
            logger.debug('selectCommit', commitHash);
            if (isConnected() === false) {
                callback(new Error('There is no open database connection!'));
                return;
            }
            if (!state.project) {
                callback(new Error('selectCommit invoked without open project'));
                return;
            }
            var prevBranchName;

            function openCommit(err) {
                if (err) {
                    logger.error('Problems closing existing branch', err);
                    callback(err);
                    return;
                }

                state.viewer = true;
                changeBranchStatus(null);
                state.project.loadObject(commitHash, function (err, commitObj) {
                    if (!err && commitObj) {
                        logState('info', 'selectCommit loaded commit');
                        loading(commitObj.root, function (err, aborted) {
                            if (err) {
                                logger.error('loading returned error', commitObj.root, err);
                                logState('error', 'selectCommit loading');
                                callback(err);
                            } else if (aborted === true) {
                                logState('warn', 'selectCommit loading');
                                callback('Loading selected commit was aborted');
                            } else {
                                addCommit(commitHash);
                                logger.debug('loading complete for selectCommit rootHash', commitObj.root);
                                logState('info', 'selectCommit loading');
                                changeBranchStatus(null);
                                callback(null);
                            }
                        });
                    } else {
                        logger.error('Cannot view given ' + commitHash + ' commit as it\'s root cannot be loaded! [' +
                            JSON.stringify(err) + ']');
                        callback(err || new Error('commit object cannot be found!'));
                    }
                });
            }

            if (state.branchName !== null) {
                logger.debug('Branch was open, closing it first', state.branchName);
                prevBranchName = state.branchName;
                state.branchName = null;
                //state.branchStatus = null;
                storage.closeBranch(state.project.name, prevBranchName, openCommit);
            } else {
                openCommit(null);
            }
        };

        function getDefaultCommitHandler() {
            return function (commitQueue, result, callback) {
                logger.debug('default commitHandler invoked, result: ', result);
                logger.debug('commitQueue', commitQueue);

                if (result.status === CONSTANTS.STORAGE.SYNCH) {
                    logger.debug('You are in synch.');
                    logState('info', 'commitHandler');
                    if (commitQueue.length === 1) {
                        logger.debug('No commits queued.');
                        changeBranchStatus(CONSTANTS.BRANCH_STATUS.SYNC);
                    } else {
                        logger.debug('Will proceed with next queued commit...');
                        changeBranchStatus(CONSTANTS.BRANCH_STATUS.AHEAD_SYNC, commitQueue);
                    }
                    callback(true); // push:true
                } else if (result.status === CONSTANTS.STORAGE.FORKED) {
                    logger.debug('You got forked');
                    logState('info', 'commitHandler');
                    changeBranchStatus(CONSTANTS.BRANCH_STATUS.AHEAD_NOT_SYNC, commitQueue);
                    callback(false); // push:false
                } else {
                    callback(false);
                    changeBranchStatus(null);
                    throw new Error('Unexpected result', result);
                }
            };
        }

        function getUpdateHandler() {
            return function (updateQueue, eventData, callback) {
                var commitHash = eventData.commitObject[CONSTANTS.STORAGE.MONGO_ID];
                logger.debug('updateHandler invoked. project, branch', eventData.projectName, eventData.branchName);
                if (state.inTransaction) {
                    logger.warn('Is in transaction, will not load in changes');
                    callback(true); // aborted: true
                    return;
                }
                logger.debug('loading commitHash', commitHash);
                //undo-redo
                logger.debug('foreign modification clearing undo-redo chain');
                addModification(eventData.commitObject, true);
                self.dispatchEvent(CONSTANTS.UNDO_AVAILABLE, canUndo());
                self.dispatchEvent(CONSTANTS.REDO_AVAILABLE, canRedo());
                changeBranchStatus(CONSTANTS.BRANCH_STATUS.PULLING, updateQueue.length);
                loading(eventData.commitObject.root, function (err, aborted) {
                    if (err) {
                        logger.error('updateHandler invoked loading and it returned error',
                            eventData.commitObject.root, err);
                        logState('error', 'updateHandler');
                        callback(true); // aborted: true
                    } else if (aborted === true) {
                        logState('warn', 'updateHandler');
                        callback(true); // aborted: true
                    } else {
                        addCommit(commitHash);
                        logger.debug('loading complete for incoming rootHash', eventData.commitObject.root);
                        logState('debug', 'updateHandler');
                        if (updateQueue.length === 1) {
                            changeBranchStatus(CONSTANTS.BRANCH_STATUS.SYNC);
                        }
                        callback(false); // aborted: false
                    }
                });
            };
        }

        function changeBranchStatus(branchStatus, details) {
            logger.debug('changeBranchStatus, prev, new, details', state.branchStatus, branchStatus, details);
            state.branchStatus = branchStatus;
            if (branchStatus === CONSTANTS.BRANCH_STATUS.SYNC) {
                state.inSync = true;
            } else if (branchStatus === CONSTANTS.BRANCH_STATUS.AHEAD_NOT_SYNC) {
                state.inSync = false;
            }
            self.dispatchEvent(CONSTANTS.BRANCH_STATUS_CHANGED, {status: branchStatus, details: details});
        }

        this.forkCurrentBranch = function (newName, commitHash, callback) {
            var self = this,
                activeBranchName = self.getActiveBranchName(),
                activeProjectName = self.getActiveProjectName(),
                forkName;

            logger.debug('forkCurrentBranch', newName, commitHash);
            if (!state.project) {
                callback('Cannot fork without an open project!');
                return;
            }
            if (activeBranchName === null) {
                callback('Cannot fork without an open branch!');
                return;
            }
            forkName = newName || activeBranchName + '_' + (new Date()).getTime();
            storage.forkBranch(activeProjectName, activeBranchName, forkName, commitHash,
                function (err, forkHash) {
                    if (err) {
                        logger.error('Could not fork branch:', newName, err);
                        callback(err);
                        return;
                    }
                    callback(null, forkName, forkHash);
                }
            );
        };

        // State getters.
        this.getNetworkStatus = function () {
            return state.connection;
        };

        this.getBranchStatus = function () {
            return state.branchStatus;
        };

        this.getActiveProjectName = function () {
            return state.project && state.project.name;
        };

        this.getActiveBranchName = function () {
            return state.branchName;
        };

        this.getActiveCommitHash = function () {
            return state.commit.current;
        };

        this.getActiveRootHash = function () {
            return state.root.current;
        };

        this.isProjectReadOnly = function () {
            return state.readOnlyProject;
        };

        this.isCommitReadOnly = function () {
            // This means that a specific commit is selected w/o regards to any branch.
            return state.viewer;
        };

        this.getProjectObject = function () {
            return state.project;
        };

        // Undo/Redo functionality
        function addModification(commitObject, clear) {
            var newItem;
            if (clear) {
                state.undoRedoChain = {
                    commit: commitObject[CONSTANTS.STORAGE.MONGO_ID],
                    root: commitObject.root,
                    previous: null,
                    next: null
                };
                return;
            }

            newItem = {
                commit: commitObject[CONSTANTS.STORAGE.MONGO_ID],
                root: commitObject.root,
                previous: state.undoRedoChain,
                next: null
            };
            state.undoRedoChain.next = newItem;
            state.undoRedoChain = newItem;
        }

        function canUndo() {
            var result = false;
            if (state.undoRedoChain && state.undoRedoChain.previous) {
                result = true;
            }

            return result;
        }

        function canRedo() {
            var result = false;
            if (state.undoRedoChain && state.undoRedoChain.next) {
                result = true;
            }

            return result;
        }

        this.undo = function (branchName, callback) {
            if (canUndo() === false) {
                callback(new Error('unable to make undo'));
                return;
            }

            state.undoRedoChain = state.undoRedoChain.previous;

            loading(state.undoRedoChain.root, function (err) {
                //TODO do we need to handle this??
                if (err) {
                    logger.error(err);
                }
            });
            self.dispatchEvent(CONSTANTS.UNDO_AVAILABLE, canUndo());
            self.dispatchEvent(CONSTANTS.REDO_AVAILABLE, canRedo());
            logState('info', 'undo [before setBranchHash]');
            storage.setBranchHash(state.project.name,
                state.branchName, state.undoRedoChain.commit, state.commit.current, function (err) {
                    if (err) {
                        //TODO do we need to handle this? How?
                        callback(err);
                        return;
                    }

                    state.commit.current = state.undoRedoChain.commit;
                    logState('info', 'undo [after setBranchHash]');
                    callback(null);
                }
            );

        };

        this.redo = function (branchName, callback) {
            if (canRedo() === false) {
                callback(new Error('unable to make redo'));
                return;
            }

            state.undoRedoChain = state.undoRedoChain.next;

            loading(state.undoRedoChain.root, function (err) {
                //TODO do we need to handle this??
                if (err) {
                    logger.error(err);
                }
            });
            self.dispatchEvent(CONSTANTS.UNDO_AVAILABLE, canUndo());
            self.dispatchEvent(CONSTANTS.REDO_AVAILABLE, canRedo());
            logState('info', 'redo [before setBranchHash]');
            storage.setBranchHash(state.project.name,
                state.branchName, state.undoRedoChain.commit, state.commit.current, function (err) {
                    if (err) {
                        //TODO do we need to handle this? How?
                        callback(err);
                        return;
                    }
                    state.commit.current = state.undoRedoChain.commit;
                    logState('info', 'redo [after setBranchHash]');
                    callback(null);
                }
            );
        };

        // REST-like functions and forwarded to storage TODO: add these to separate base class

        //  Getters
        this.getProjects = function (callback) {
            if (isConnected()) {
                storage.getProjects(callback);
            } else {
                callback(new Error('There is no open database connection!'));
            }
        };

        this.getBranches = function (projectName, callback) {
            if (isConnected()) {
                storage.getBranches(projectName, callback);
            } else {
                callback(new Error('There is no open database connection!'));
            }
        };

        this.getCommits = function (projectName, before, number, callback) {
            if (isConnected()) {
                storage.getCommits(projectName, before, number, callback);
            } else {
                callback(new Error('There is no open database connection!'));
            }
        };

        this.getLatestCommitData = function (projectName, branchName, callback) {
            if (isConnected()) {
                storage.getLatestCommitData(projectName, branchName, callback);
            } else {
                callback(new Error('There is no open database connection!'));
            }
        };

        this.getProjectsAndBranches = function (asObject, callback) {
            if (isConnected()) {
                storage.getProjectsAndBranches(function (err, projectsWithBranches) {
                    var i,
                        result = {};
                    if (err) {
                        callback(err);
                        return;
                    }
                    if (asObject === true) {
                        //Move the result in the same format as before.
                        for (i = 0; i < projectsWithBranches.length; i += 1) {
                            result[projectsWithBranches[i].name] = {
                                branches: projectsWithBranches[i].branches,
                                rights: {
                                    read: projectsWithBranches[i].read,
                                    write: projectsWithBranches[i].write,
                                    delete: projectsWithBranches[i].delete,
                                }
                            };
                        }
                        callback(null, result);
                    } else {
                        callback(null, projectsWithBranches);
                    }

                });
            } else {
                callback(new Error('There is no open database connection!'));
            }
        };

        //  Setters
        this.createProject = function (projectName, parameters, callback) {
            if (isConnected()) {
                storage.createProject(projectName, parameters, callback);
            } else {
                callback(new Error('There is no open database connection!'));
            }
        };

        this.deleteProject = function (projectName, callback) {
            if (isConnected()) {
                storage.deleteProject(projectName, function (err, didExist) {
                    if (err) {
                        callback(new Error(err));
                        return;
                    }
                    callback(null, didExist);
                });
            } else {
                callback(new Error('There is no open database connection!'));
            }
        };

        this.createBranch = function (projectName, branchName, newHash, callback) {
            if (isConnected()) {
                storage.createBranch(projectName, branchName, newHash, callback);
            } else {
                callback(new Error('There is no open database connection!'));
            }
        };

        this.deleteBranch = function (projectName, branchName, oldHash, callback) {
            if (isConnected()) {
                storage.deleteBranch(projectName, branchName, oldHash, callback);
            } else {
                callback(new Error('There is no open database connection!'));
            }
        };

        // Watchers (used in e.g. ProjectNavigator).
        /**
         * Triggers eventHandler(storage, eventData) on PROJECT_CREATED and PROJECT_DELETED.
         *
         * eventData = {
         *    etype: PROJECT_CREATED||DELETED,
         *    projectName: %name of project%
         * }
         *
         * @param {function} eventHandler
         * @param {function} [callback]
         */
        this.watchDatabase = function (eventHandler, callback) {
            callback = callback || function (err) {
                    if (err) {
                        logger.error('Problems watching database room');
                    }
                };
            storage.watchDatabase(eventHandler, callback);
        };

        this.unwatchDatabase = function (eventHandler, callback) {
            callback = callback || function (err) {
                    if (err) {
                        logger.error('Problems unwatching database room');
                    }
                };
            storage.unwatchDatabase(eventHandler, callback);
        };

        /**
         * Triggers eventHandler(storage, eventData) on BRANCH_CREATED, BRANCH_DELETED and BRANCH_HASH_UPDATED
         * for the given projectName.
         *
         *
         * eventData = {
         *    etype: BRANCH_CREATED||DELETED||HASH_UPDATED,
         *    projectName: %name of project%,
         *    branchName: %name of branch%,
         *    newHash: %new commitHash (='' when DELETED)%
         *    oldHash: %previous commitHash (='' when CREATED)%
         * }
         *
         * @param {string} projectName
         * @param {function} eventHandler
         * @param {function} [callback]
         */
        this.watchProject = function (projectName, eventHandler, callback) {
            callback = callback || function (err) {
                    if (err) {
                        logger.error('Problems watching project room', projectName);
                    }
                };
            storage.watchProject(projectName, eventHandler, callback);
        };

        this.unwatchProject = function (projectName, eventHandler, callback) {
            callback = callback || function (err) {
                    if (err) {
                        logger.error('Problems unwatching project room', projectName);
                    }
                };
            storage.unwatchProject(projectName, eventHandler, callback);
        };

        // Internal functions
        function isConnected() {
            return state.connection === CONSTANTS.STORAGE.CONNECTED ||
                state.connection === CONSTANTS.STORAGE.RECONNECTED;
        }

        var ROOT_PATH = ''; //FIXME: This should come from constants..

        function COPY(object) {
            if (object) {
                return JSON.parse(JSON.stringify(object));
            }
            return null;
        }

        // Node handling
        this.getNode = function (nodePath) {
            return getNode(nodePath, logger, state, self.meta, storeNode);
        };

        function getStringHash(/* node */) {
            //TODO there is a memory issue with the huge strings so we have to replace it with something
            state.gHash += 1;
            return state.gHash;
        }

        function getModifiedNodes(newerNodes) {
            var modifiedNodes = [],
                i;

            for (i in state.nodes) {
                if (state.nodes.hasOwnProperty(i)) {
                    if (newerNodes[i]) {
                        if (newerNodes[i].hash !== state.nodes[i].hash && state.nodes[i].hash !== '') {
                            modifiedNodes.push(i);
                        }
                    }
                }
            }
            return modifiedNodes;
        }

        //this is just a first brute implementation it needs serious optimization!!!
        function fitsInPatternTypes(path, pattern) {
            var i;

            if (pattern.items && pattern.items.length > 0) {
                for (i = 0; i < pattern.items.length; i += 1) {
                    if (self.meta.isTypeOf(path, pattern.items[i])) {
                        return true;
                    }
                }
                return false;
            } else {
                return true;
            }
        }

        function patternToPaths(patternId, pattern, pathsSoFar) {
            var children,
                subPattern,
                i;

            if (state.nodes[patternId]) {
                pathsSoFar[patternId] = true;
                if (pattern.children && pattern.children > 0) {
                    children = state.core.getChildrenPaths(state.nodes[patternId].node);
                    subPattern = COPY(pattern);
                    subPattern.children -= 1;
                    for (i = 0; i < children.length; i += 1) {
                        if (fitsInPatternTypes(children[i], pattern)) {
                            patternToPaths(children[i], subPattern, pathsSoFar);
                        }
                    }
                }
            } else {
                state.loadError++;
            }
        }

        function userEvents(userId, modifiedNodes) {
            var newPaths = {},
                startErrorLevel = state.loadError,
                i,
                events = [];

            for (i in state.users[userId].PATTERNS) {
                if (state.users[userId].PATTERNS.hasOwnProperty(i)) {
                    if (state.nodes[i]) { //TODO we only check pattern if its root is there...
                        patternToPaths(i, state.users[userId].PATTERNS[i], newPaths);
                    }
                }
            }

            if (startErrorLevel !== state.loadError) {
                return; //we send events only when everything is there correctly
            }

            //deleted items
            for (i in state.users[userId].PATHS) {
                if (!newPaths[i]) {
                    events.push({etype: 'unload', eid: i});
                }
            }

            //added items
            for (i in newPaths) {
                if (!state.users[userId].PATHS[i]) {
                    events.push({etype: 'load', eid: i});
                }
            }

            //updated items
            for (i = 0; i < modifiedNodes.length; i++) {
                if (newPaths[modifiedNodes[i]]) {
                    events.push({etype: 'update', eid: modifiedNodes[i]});
                }
            }

            state.users[userId].PATHS = newPaths;

            //this is how the events should go
            if (events.length > 0) {
                if (state.loadError > startErrorLevel) {
                    events.unshift({etype: 'incomplete', eid: null});
                } else {
                    events.unshift({etype: 'complete', eid: null});
                }
            } else {
                events.unshift({etype: 'complete', eid: null});
            }
            state.users[userId].FN(events);
        }

        function loadChildrenPattern(core, nodesSoFar, node, level, callback) {
            var path = core.getPath(node),
                childrenPaths = core.getChildrenPaths(node),
                childrenRelids = core.getChildrenRelids(node),
                missing = childrenPaths.length,
                error = null,
                i,
                childLoaded = function (err, child) {
                    if (err || child === null) {
                        error = error || err;
                        missing -= 1;
                        if (missing === 0) {
                            callback(error);
                        }
                    } else {
                        loadChildrenPattern(core, nodesSoFar, child, level - 1, childrenPatternLoaded);
                    }
                },
                childrenPatternLoaded = function (err) {
                    error = error || err;
                    missing -= 1;
                    if (missing === 0) {
                        callback(error);
                    }
                };
            state.metaNodes[path] = node;
            if (!nodesSoFar[path]) {
                nodesSoFar[path] = {node: node, incomplete: true, basic: true, hash: getStringHash(node)};
            }
            if (level > 0) {
                if (missing > 0) {
                    for (i = 0; i < childrenPaths.length; i++) {
                        if (nodesSoFar[childrenPaths[i]]) {
                            loadChildrenPattern(core,
                                nodesSoFar,
                                nodesSoFar[childrenPaths[i]].node,
                                level - 1, childrenPatternLoaded);
                        } else {
                            core.loadChild(node, childrenRelids[i], childLoaded);
                        }
                    }
                } else {
                    callback(error);
                }
            } else {
                callback(error);
            }
        }

        function loadPattern(core, id, pattern, nodesSoFar, callback) {
            var base = null,
                baseLoaded = function () {
                    if (pattern.children && pattern.children > 0) {
                        var level = pattern.children;
                        loadChildrenPattern(core, nodesSoFar, base, level, callback);
                    } else {
                        callback(null);
                    }
                };

            if (nodesSoFar[id]) {
                base = nodesSoFar[id].node;
                baseLoaded();
            } else {
                base = null;
                if (state.loadNodes[ROOT_PATH]) {
                    base = state.loadNodes[ROOT_PATH].node;
                } else if (state.nodes[ROOT_PATH]) {
                    base = state.nodes[ROOT_PATH].node;
                }
                core.loadByPath(base, id, function (err, node) {
                    var path;
                    if (!err && node && !core.isEmpty(node)) {
                        path = core.getPath(node);
                        state.metaNodes[path] = node;
                        if (!nodesSoFar[path]) {
                            nodesSoFar[path] = {
                                node: node,
                                incomplete: false,
                                basic: true,
                                hash: getStringHash(node)
                            };
                        }
                        base = node;
                        baseLoaded();
                    } else {
                        callback(err);
                    }
                });
            }
        }

        function orderStringArrayByElementLength(strArray) {
            var ordered = [],
                i, j, index;

            for (i = 0; i < strArray.length; i++) {
                index = -1;
                j = 0;
                while (index === -1 && j < ordered.length) {
                    if (ordered[j].length > strArray[i].length) {
                        index = j;
                    }
                    j++;
                }

                if (index === -1) {
                    ordered.push(strArray[i]);
                } else {
                    ordered.splice(index, 0, strArray[i]);
                }
            }
            return ordered;
        }

        function loadRoot(newRootHash, callback) {
            //with the newer approach we try to optimize a bit the mechanism of the loading and
            // try to get rid of the parallelism behind it
            var patterns = {},
                orderedPatternIds = [],
                error = null,
                i,
                j,
                keysi,
                keysj;

            state.loadNodes = {};
            state.loadError = 0;

            //gathering the patterns
            keysi = Object.keys(state.users);
            for (i = 0; i < keysi.length; i++) {
                keysj = Object.keys(state.users[keysi[i]].PATTERNS);
                for (j = 0; j < keysj.length; j++) {
                    if (patterns[keysj[j]]) {
                        //we check if the range is bigger for the new definition
                        if (patterns[keysj[j]].children < state.users[keysi[i]].PATTERNS[keysj[j]].children) {
                            patterns[keysj[j]].children = state.users[keysi[i]].PATTERNS[keysj[j]].children;
                        }
                    } else {
                        patterns[keysj[j]] = state.users[keysi[i]].PATTERNS[keysj[j]];
                    }
                }
            }
            //getting an ordered key list
            orderedPatternIds = Object.keys(patterns);
            orderedPatternIds = orderStringArrayByElementLength(orderedPatternIds);


            //and now the one-by-one loading
            state.core.loadRoot(newRootHash, function (err, root) {
                var fut,
                    _loadPattern;

                ASSERT(err || root);

                state.root.object = root;
                addOnFunctions.updateRunningAddOns(root);
                error = error || err;
                if (!err) {
                    //_clientGlobal.addOn.updateRunningAddOns(root); //FIXME: ADD ME BACK!!
                    state.loadNodes[state.core.getPath(root)] = {
                        node: root,
                        incomplete: true,
                        basic: true,
                        hash: getStringHash(root)
                    };
                    state.metaNodes[state.core.getPath(root)] = root;
                    if (orderedPatternIds.length === 0 && Object.keys(state.users) > 0) {
                        //we have user, but they do not interested in any object -> let's relaunch them :D
                        callback(null);
                        reLaunchUsers();
                    } else {
                        _loadPattern = TASYNC.throttle(TASYNC.wrap(loadPattern), 1);
                        fut = TASYNC.lift(
                            orderedPatternIds.map(function (pattern /*, index */) {
                                return TASYNC.apply(_loadPattern,
                                    [state.core, pattern, patterns[pattern], state.loadNodes],
                                    this);
                            }));
                        TASYNC.unwrap(function () {
                            return fut;
                        })(callback);
                    }
                } else {
                    callback(err);
                }
            });
        }

        //this is just a first brute implementation it needs serious optimization!!!
        function loading(newRootHash, callback) {
            var firstRoot = !state.nodes[ROOT_PATH],
                originatingRootHash = state.nodes[ROOT_PATH] ? state.core.getHash(state.nodes[ROOT_PATH].node) : null,
                finalEvents = function () {
                    var modifiedPaths,
                        i;

                    modifiedPaths = getModifiedNodes(state.loadNodes);
                    state.nodes = state.loadNodes;
                    state.loadNodes = {};
                    state.root.previous = state.root.current;
                    state.root.current = newRootHash;
                    for (i in state.users) {
                        if (state.users.hasOwnProperty(i)) {
                            userEvents(i, modifiedPaths);
                        }
                    }
                    callback(null);
                };
            logger.debug('loading newRootHash', newRootHash);

            callback = callback || function (/*err*/) {
                };


            loadRoot(newRootHash, function (err) {
                if (err) {
                    state.root.current = null;
                    callback(err);
                } else {
                    if (firstRoot ||
                        state.core.getHash(state.nodes[ROOT_PATH].node) === originatingRootHash) {
                        finalEvents();
                    } else {
                        // This relies on the fact that loading is synchronous for local updates.
                        logger.warn('Modifications were done during loading - load aborted.');
                        callback(null, true);
                    }
                }
            });
        }

        this.startTransaction = function (msg) {
            if (state.inTransaction) {
                logger.error('Already in transaction, will proceed though..');
            }
            if (state.core) {
                state.inTransaction = true;
                msg = msg || 'startTransaction()';
                saveRoot(msg);
            } else {
                logger.error('Can not start transaction with no core avaliable.');
            }
        };

        this.completeTransaction = function (msg, callback) {
            state.inTransaction = false;
            if (state.core) {
                msg = msg || 'completeTransaction()';
                saveRoot(msg, callback);
            }
        };

        function addCommit(commitHash) {
            state.commit.previous = state.commit.current;
            state.commit.current = commitHash;
        }

        //territory functions
        this.addUI = function (ui, fn, guid) {
            ASSERT(fn);
            ASSERT(typeof fn === 'function');
            guid = guid || GUID();
            state.users[guid] = {type: 'notused', UI: ui, PATTERNS: {}, PATHS: {}, SENDEVENTS: true, FN: fn};
            return guid;
        };

        this.removeUI = function (guid) {
            logger.debug('removeUI', guid);
            delete state.users[guid];
        };

        function reLaunchUsers() {
            var i;
            for (i in state.users) {
                if (state.users.hasOwnProperty(i)) {
                    if (state.users[i].UI.reLaunch) {
                        state.users[i].UI.reLaunch();
                    }
                }
            }
        }

        function _updateTerritoryAllDone(guid, patterns, error) {
            if (state.users[guid]) {
                state.users[guid].PATTERNS = JSON.parse(JSON.stringify(patterns));
                if (!error) {
                    userEvents(guid, []);
                }
            }
        }

        this.updateTerritory = function (guid, patterns) {
            var missing,
                error,
                patternLoaded,
                i;

            if (state.users[guid]) {
                if (state.project) {
                    if (state.nodes[ROOT_PATH]) {
                        //TODO: this has to be optimized
                        missing = 0;
                        error = null;

                        patternLoaded = function (err) {
                            error = error || err;
                            missing -= 1;
                            if (missing === 0) {
                                //allDone();
                                _updateTerritoryAllDone(guid, patterns, error);
                            }
                        };

                        for (i in patterns) {
                            missing += 1;
                        }
                        if (missing > 0) {
                            for (i in patterns) {
                                if (patterns.hasOwnProperty(i)) {
                                    loadPattern(state.core, i, patterns[i], state.nodes, patternLoaded);
                                }
                            }
                        } else {
                            //allDone();
                            _updateTerritoryAllDone(guid, patterns, error);
                        }
                    } else {
                        //something funny is going on
                        if (state.loadNodes[ROOT_PATH]) {
                            //probably we are in the loading process,
                            // so we should redo this update when the loading finishes
                            //setTimeout(updateTerritory, 100, guid, patterns);
                        } else {
                            //root is not in nodes and has not even started to load it yet...
                            state.users[guid].PATTERNS = JSON.parse(JSON.stringify(patterns));
                        }
                    }
                } else {
                    //we should update the patterns, but that is all
                    state.users[guid].PATTERNS = JSON.parse(JSON.stringify(patterns));
                }
            }
        };

        function cleanUsersTerritories() {
            //look out as the user can remove itself at any time!!!
            var userIds = Object.keys(state.users),
                i,
                j,
                events;

            for (i = 0; i < userIds.length; i++) {
                if (state.users[userIds[i]]) {
                    events = [{eid: null, etype: 'complete'}];
                    for (j in state.users[userIds[i]].PATHS
                        ) {
                        events.push({etype: 'unload', eid: j});
                    }
                    state.users[userIds[i]].PATTERNS = {};
                    state.users[userIds[i]].PATHS = {};
                    state.users[userIds[i]].SENDEVENTS = true;
                    state.users[userIds[i]].FN(events);
                }
            }
        }

        this.getUserId = function () {
            var cookies = URL.parseCookie(document.cookie);
            if (cookies.webgme) {
                return cookies.webgme;
            } else {
                return 'n/a';
            }
        };

        //create from file
        this.createProjectFromFile = function (projectName, jProject, callback) {
            //TODO somehow the export / import should contain the INFO field
            // so the tags and description could come from it
            storage.createProject(projectName, function (err, project) {
                if (err) {
                    callback(err);
                    return;
                }

                var core = new Core(project, {
                        globConf: gmeConfig,
                        logger: logger.fork('core')
                    }),
                    root = core.createNode({parent: null, base: null}),
                    persisted = core.persist(root);

                storage.makeCommit(projectName,
                    null,
                    [],
                    persisted.rootHash,
                    persisted.objects,
                    'creating project from a file',
                    function (err, commitResult) {
                        if (err) {
                            logger.error('cannot make initial commit for project creation from file');
                            callback(err);
                            return;
                        }

                        project.createBranch('master', commitResult.hash, function (err) {
                            if (err) {
                                logger.error('cannot set branch \'master\' for project creation from file');
                                callback(err);
                                return;
                            }

                            storage.closeProject(projectName, function (err) {
                                if (err) {
                                    callback(err);
                                    return;
                                }
                                self.selectProject(projectName, function (err) {
                                    if (err) {
                                        callback(err);
                                        return;
                                    }

                                    Serialization.import(state.core, state.root.object, jProject, function (err) {
                                        if (err) {
                                            return callback(err);
                                        }
                                        saveRoot('project created from file', callback);
                                    });
                                });
                            });
                        });
                    }
                );
            });
        };

        //seed
        this.seedProject = function (parameters, callback) {
            parameters.command = 'seedProject';
            storage.simpleRequest(parameters, function (err, id) {
                if (err) {
                    callback(err);
                    return;
                }

                storage.simpleResult(id, callback);
            });
        };

        //export branch
        this.getExportProjectBranchUrl = function (projectName, branchName, fileName, callback) {
            var command = {};
            command.command = 'exportLibrary';
            command.name = projectName;
            command.branch = branchName;
            command.path = ROOT_PATH;
            if (command.name && command.branch) {
                storage.simpleRequest(command, function (err, resId) {
                    if (err) {
                        callback(err);
                    } else {
                        callback(null,
                            window.location.protocol + '//' + window.location.host + '/worker/simpleResult/' +
                            resId + '/' + fileName);
                    }
                });
            } else {
                callback(new Error('invalid parameters!'));
            }
        };

        //dump nodes
        this.getExportItemsUrl = function (paths, filename, callback) {
            storage.simpleRequest({
                    command: 'dumpMoreNodes',
                    name: state.project.name,
                    hash: state.root.current,
                    nodes: paths
                },
                function (err, resId) {
                    if (err) {
                        callback(err);
                    } else {
                        callback(null,
                            window.location.protocol + '//' + window.location.host + '/worker/simpleResult/' +
                            resId + '/' + filename);
                    }
                });
        };

        //library functions
        this.getExportLibraryUrl = function (libraryRootPath, filename, callback) {
            var command = {};
            command.command = 'exportLibrary';
            command.name = state.project.name;
            command.hash = state.root.current;
            command.path = libraryRootPath;
            if (command.name && command.hash) {
                storage.simpleRequest(command, function (err, resId) {
                    if (err) {
                        callback(err);
                    } else {
                        callback(null,
                            window.location.protocol + '//' + window.location.host + '/worker/simpleResult/' +
                            resId + '/' + filename);
                    }
                });
            } else {
                callback(new Error('there is no open project!'));
            }
        };

        this.updateLibrary = function (libraryRootPath, newLibrary, callback) {
            Serialization.import(state.core, state.nodes[libraryRootPath].node, newLibrary, function (err, log) {
                if (err) {
                    return callback(err);
                }

                saveRoot('library update done\nlogs:\n' + log, callback);
            });
        };

        this.addLibrary = function (libraryParentPath, newLibrary, callback) {
            self.startTransaction('creating library as a child of ' + libraryParentPath);
            var libraryRoot = self.createChild({
                parentId: libraryParentPath,
                baseId: null
            }, 'library placeholder');
            Serialization.import(state.core,
                state.nodes[libraryRoot].node, newLibrary, function (err, log) {
                    if (err) {
                        return callback(err);
                    }

                    self.completeTransaction('library update done\nlogs:\n' + log, callback);
                }
            );
        };

        /**
         * Run the plugin on the server inside a worker process.
         * @param {string} name - name of plugin.
         * @param {object} context
         * @param {object} context.managerConfig - where the plugin should execute.
         * @param {string} context.managerConfig.project - name of project.
         * @param {string} context.managerConfig.activeNode - path to activeNode.
         * @param {string} [context.managerConfig.activeSelection=[]] - paths to selected nodes.
         * @param {string} context.managerConfig.commit - commit hash to start the plugin from.
         * @param {string} context.managerConfig.branchName - branch which to save to.
         * @param {object} [context.pluginConfig=%defaultForPlugin%] - specific configuration for the plugin.
         * @param {function} callback
         */
        this.runServerPlugin = function (name, context, callback) {
            storage.simpleRequest({command: 'executePlugin', name: name, context: context}, callback);
        };

        /**
         * @param {string[]} pluginNames - All avaliable plugins from server.
         * @param {string} [nodePath=''] - Node to get the validPlugins from.
         * @returns {string[]} - Filtered plugin names.
         */
        this.filterPlugins = function (pluginNames, nodePath) {
            var filteredNames = [],
                validPlugins,
                i,
                node;

            logger.debug('filterPluginsBasedOnNode allPlugins, given nodePath', pluginNames, nodePath);
            if (!nodePath) {
                logger.debug('filterPluginsBasedOnNode nodePath not given - will fall back on root-node.');
                nodePath = ROOT_PATH;
            }

            node = state.nodes[nodePath];

            if (!node) {
                logger.warn('filterPluginsBasedOnNode node not loaded - will fall back on root-node.', nodePath);
                nodePath = ROOT_PATH;
                node = state.nodes[nodePath];
            }

            if (!node) {
                logger.warn('filterPluginsBasedOnNode root node not loaded - will return full list.');
                return pluginNames;
            }

            validPlugins = (state.core.getRegistry(node.node, 'validPlugins') || '').split(' ');
            for (i = 0; i < validPlugins.length; i += 1) {
                if (pluginNames.indexOf(validPlugins[i]) > -1) {
                    filteredNames.push(validPlugins[i]);
                } else {
                    logger.warn('Registered plugin for node at path "' + nodePath +
                        '" is not amongst avaliable plugins', pluginNames);
                }
            }

            return filteredNames;
        };

        //addOn
        this.validateProjectAsync = addOnFunctions.validateProjectAsync;
        this.validateModelAsync = addOnFunctions.validateModelAsync;
        this.validateNodeAsync = addOnFunctions.validateNodeAsync;
        this.setValidationCallback = addOnFunctions.setValidationCallback;
        this.getDetailedHistoryAsync = addOnFunctions.getDetailedHistoryAsync;
        this.getRunningAddOnNames = addOnFunctions.getRunningAddOnNames;
        this.addOnsAllowed = gmeConfig.addOn.enable === true;

        //constraint
        this.setConstraint = function (path, name, constraintObj) {
            if (state.core && state.nodes[path] && typeof state.nodes[path].node === 'object') {
                state.core.setConstraint(state.nodes[path].node, name, constraintObj);
                saveRoot('setConstraint(' + path + ',' + name + ')');
            }
        };

        this.delConstraint = function (path, name) {
            if (state.core && state.nodes[path] && typeof state.nodes[path].node === 'object') {
                state.core.delConstraint(state.nodes[path].node, name);
                saveRoot('delConstraint(' + path + 'name' + ')');
            }
        };

        //automerge
        this.autoMerge = function (projectName, mine, theirs, callback) {
            var command = {
                command: 'autoMerge',
                project: projectName,
                mine: mine,
                theirs: theirs
            };
            storage.simpleRequest(command, function (err, resId) {
                if (err) {
                    callback(err);
                } else {
                    storage.simpleResult(resId, callback);
                }
            });
        };

        this.resolve = function (mergeResult, callback) {
            var command = {
                command: 'resolve',
                partial: mergeResult
            };
            storage.simpleRequest(command, function (err, resId) {
                if (err) {
                    callback(err);
                } else {
                    storage.simpleResult(resId, callback);
                }
            });
        };
    }


// Inherit from the EventDispatcher
    Client.prototype = Object.create(EventDispatcher.prototype);
    Client.prototype.constructor = Client;

    return Client;
  });

/*globals define*/
/*jshint browser: true, node:true*/

/**
 * Client module for accessing the blob.
 *
 * @author lattmann / https://github.com/lattmann
 */

define('blob/BlobConfig',[], function () {
    
    var BlobConfig = {
        hashMethod: 'sha1', // TODO: in the future we may switch to sha512
        hashRegex: new RegExp('^[0-9a-f]{40}$')
    };

    return BlobConfig;
});
/*globals define*/
/*jshint browser: true, node:true*/

/**
 * Client module for accessing the blob.
 *
 * @author lattmann / https://github.com/lattmann
 */

define('blob/BlobMetadata',['blob/BlobConfig'], function (BlobConfig) {
    

    /**
     * Initializes a new instance of BlobMetadata
     * @param {object} metadata - A serialized metadata object.
     * @param {string} metadata.name
     * @param {string|Object} metadata.content
     * @param {number} [metadata.size=0]
     * @param {BlobMetadata.CONTENT_TYPES} [metadata.contentType=BlobMetadata.CONTENT_TYPES.OBJECT]
     * @param {string} [metadata.mime='']
     * @param {boolean} [metadata.isPublic=false]
     * @param {string[]} [metadata.tags=[]]
     * @constructor
     */
    var BlobMetadata = function (metadata) {
        var key;
        if (metadata) {
            this.name = metadata.name;
            this.size = metadata.size || 0;
            this.mime = metadata.mime || '';
            this.isPublic = metadata.isPublic || false;
            this.tags = metadata.tags || [];
            this.content = metadata.content;
            this.contentType = metadata.contentType || BlobMetadata.CONTENT_TYPES.OBJECT;
            if (this.contentType === BlobMetadata.CONTENT_TYPES.COMPLEX) {
                for (key in this.content) {
                    if (this.content.hasOwnProperty(key)) {
                        if (BlobConfig.hashRegex.test(this.content[key].content) === false) {
                            throw Error('BlobMetadata is malformed: hash \'' + this.content[key].content + '\'is invalid');
                        }
                    }
                }
            }
        } else {
            throw new Error('metadata parameter is not defined');
        }
    };

    /**
     * Type of the metadata
     * @type {{OBJECT: string, COMPLEX: string, SOFT_LINK: string}}
     */
    BlobMetadata.CONTENT_TYPES = {
        OBJECT: 'object',
        COMPLEX: 'complex',
        SOFT_LINK: 'softLink'
    };

    /**
     * Serializes the metadata to a JSON object.
     * @returns {{
     *  name: string,
     *  size: number,
     *  mime: string,
     *  tags: Array.<string>,
     *  content: (string|Object},
     *  contentType: string}}
     */
    BlobMetadata.prototype.serialize = function () {
        var metadata = {
            name: this.name,
            size: this.size,
            mime: this.mime,
            isPublic: this.isPublic,
            tags: this.tags,
            content: this.content,
            contentType: this.contentType
        };

        metadata.tags.sort();

        if (this.contentType === BlobMetadata.CONTENT_TYPES.COMPLEX) {
            // override on  purpose to normalize content
            metadata.content = {};
            var fnames = Object.keys(this.content);
            fnames.sort();

            for (var j = 0; j < fnames.length; j += 1) {
                metadata.content[fnames[j]] = this.content[fnames[j]];
            }
        }

        return metadata;
    };

    return BlobMetadata;
});

/*globals define*/
/*jshint browser: true, node:true*/

/*
 * @author lattmann / https://github.com/lattmann
 */

define('blob/Artifact',['blob/BlobMetadata', 'blob/BlobConfig', 'common/core/tasync'], function (BlobMetadata, BlobConfig, tasync) {
    
    /**
     * Creates a new instance of artifact, i.e. complex object, in memory. This object can be saved in the storage.
     * @param {string} name Artifact's name without extension
     * @param {blob.BlobClient} blobClient
     * @param {blob.BlobMetadata} descriptor
     * @constructor
     */
    var Artifact = function (name, blobClient, descriptor) {
        this.name = name;
        this.blobClient = blobClient;
        this.blobClientPutFile = tasync.unwrap(tasync.throttle(tasync.wrap(blobClient.putFile), 5));
        this.blobClientGetMetadata = tasync.unwrap(tasync.throttle(tasync.wrap(blobClient.getMetadata), 5));
        // TODO: use BlobMetadata class here
        this.descriptor = descriptor || {
            name: name + '.zip',
            size: 0,
            mime: 'application/zip',
            content: {},
            contentType: 'complex'
        }; // name and hash pairs
    };

    /**
     * Adds content to the artifact as a file.
     * @param {string} name filename
     * @param {Blob} content File object or Blob
     * @param callback
     */
    Artifact.prototype.addFile = function (name, content, callback) {
        var self = this;
        var filename = name.substring(name.lastIndexOf('/') + 1);

        self.blobClientPutFile.call(self.blobClient, filename, content, function (err, hash) {
            if (err) {
                callback(err);
                return;
            }

            self.addObjectHash(name, hash, function (err, hash) {
                callback(err, hash);
            });
        });
    };

    Artifact.prototype.addFileAsSoftLink = function (name, content, callback) {
        var self = this;
        var filename = name.substring(name.lastIndexOf('/') + 1);

        self.blobClientPutFile.call(self.blobClient, filename, content,
            function (err, hash) {
                if (err) {
                    callback(err);
                    return;
                }
                var size;
                if (content.size !== undefined) {
                    size = content.size;
                }
                if (content.length !== undefined) {
                    size = content.length;
                }

                self.addMetadataHash(name, hash, size, function (err, hash) {
                    callback(err, hash);
                });
            });
    };

    /**
     * Adds a hash to the artifact using the given file path.
     * @param {string} name Path to the file in the artifact. Note: 'a/b/c.txt'
     * @param {string} hash Metadata hash that has to be added.
     * @param callback
     */
    Artifact.prototype.addObjectHash = function (name, hash, callback) {
        var self = this;

        if (BlobConfig.hashRegex.test(hash) === false) {
            callback('Blob hash is invalid');
            return;
        }

        self.blobClientGetMetadata.call(self.blobClient, hash, function (err, metadata) {
            if (err) {
                callback(err);
                return;
            }

            if (self.descriptor.content.hasOwnProperty(name)) {
                callback('Another content with the same name was already added. ' +
                JSON.stringify(self.descriptor.content[name]));

            } else {
                self.descriptor.size += metadata.size;

                self.descriptor.content[name] = {
                    content: metadata.content,
                    contentType: BlobMetadata.CONTENT_TYPES.OBJECT
                };
                callback(null, hash);
            }
        });
    };

    Artifact.prototype.addMetadataHash = function (name, hash, size, callback) {
        var self = this,
            addMetadata = function (size) {
                if (self.descriptor.content.hasOwnProperty(name)) {
                    callback('Another content with the same name was already added. ' +
                    JSON.stringify(self.descriptor.content[name]));

                } else {
                    self.descriptor.size += size;

                    self.descriptor.content[name] = {
                        content: hash,
                        contentType: BlobMetadata.CONTENT_TYPES.SOFT_LINK
                    };
                    callback(null, hash);
                }
            };

        if (typeof size === 'function') {
            callback = size;
            size = undefined;
        }

        if (BlobConfig.hashRegex.test(hash) === false) {
            callback('Blob hash is invalid');
            return;
        }
        if (size === undefined) {
            self.blobClientGetMetadata.call(self.blobClient, hash, function (err, metadata) {
                if (err) {
                    callback(err);
                    return;
                }
                addMetadata(metadata.size);
            });
        } else {
            addMetadata(size);
        }
    };

    /**
     * Adds multiple files.
     * @param {Object.<string, Blob>} files files to add
     * @param callback
     */
    Artifact.prototype.addFiles = function (files, callback) {
        var self = this,
            fileNames = Object.keys(files),
            nbrOfFiles = fileNames.length,
            hashes = [],
            error = '',
            i,
            counterCallback = function (err, hash) {
                error = err ? error + err : error;
                nbrOfFiles -= 1;
                hashes.push(hash);
                if (nbrOfFiles === 0) {
                    if (error) {
                        return callback('Failed adding files: ' + error, hashes);
                    }
                    callback(null, hashes);
                }
            };

        if (nbrOfFiles === 0) {
            callback(null, hashes);
            return;
        }

        for (i = 0; i < fileNames.length; i += 1) {
            self.addFile(fileNames[i], files[fileNames[i]], counterCallback);
        }
    };

    /**
     * Adds multiple files as soft-links.
     * @param {Object.<string, Blob>} files files to add
     * @param callback
     */
    Artifact.prototype.addFilesAsSoftLinks = function (files, callback) {
        var self = this,
            fileNames = Object.keys(files),
            nbrOfFiles = fileNames.length,
            hashes = [],
            error = '',
            i,
            counterCallback = function (err, hash) {
                error = err ? error + err : error;
                nbrOfFiles -= 1;
                hashes.push(hash);
                if (nbrOfFiles === 0) {
                    if (error) {
                        return callback('Failed adding files as soft-links: ' + error, hashes);
                    }
                    callback(null, hashes);
                }
            };

        if (nbrOfFiles === 0) {
            callback(null, hashes);
            return;
        }

        for (i = 0; i < fileNames.length; i += 1) {
            self.addFileAsSoftLink(fileNames[i], files[fileNames[i]], counterCallback);
        }
    };

    /**
     * Adds hashes to the artifact using the given file paths.
     * @param {object.<string, string>} objectHashes - Keys are file paths and values object hashes.
     * @param callback
     */
    Artifact.prototype.addObjectHashes = function (objectHashes, callback) {
        var self = this,
            fileNames = Object.keys(objectHashes),
            nbrOfFiles = fileNames.length,
            hashes = [],
            error = '',
            i,
            counterCallback = function (err, hash) {
                error = err ? error + err : error;
                nbrOfFiles -= 1;
                hashes.push(hash);
                if (nbrOfFiles === 0) {
                    if (error) {
                        return callback('Failed adding objectHashes: ' + error, hashes);
                    }
                    callback(null, hashes);
                }
            };

        if (nbrOfFiles === 0) {
            callback(null, hashes);
            return;
        }

        for (i = 0; i < fileNames.length; i += 1) {
            self.addObjectHash(fileNames[i], objectHashes[fileNames[i]], counterCallback);
        }
    };

    /**
     * Adds hashes to the artifact using the given file paths.
     * @param {object.<string, string>} objectHashes - Keys are file paths and values object hashes.
     * @param callback
     */
    Artifact.prototype.addMetadataHashes = function (objectHashes, callback) {
        var self = this,
            fileNames = Object.keys(objectHashes),
            nbrOfFiles = fileNames.length,
            hashes = [],
            error = '',
            i,
            counterCallback = function (err, hash) {
                error = err ? error + err : error;
                nbrOfFiles -= 1;
                hashes.push(hash);
                if (nbrOfFiles === 0) {
                    if (error) {
                        return callback('Failed adding objectHashes: ' + error, hashes);
                    }
                    callback(null, hashes);
                }
            };

        if (nbrOfFiles === 0) {
            callback(null, hashes);
            return;
        }

        for (i = 0; i < fileNames.length; i += 1) {
            self.addMetadataHash(fileNames[i], objectHashes[fileNames[i]], counterCallback);
        }
    };

    /**
     * Saves this artifact and uploads the metadata to the server's storage.
     * @param callback
     */
    Artifact.prototype.save = function (callback) {
        this.blobClient.putMetadata(this.descriptor, callback);
    };

    return Artifact;
});

!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define('superagent',[],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.superagent=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * Module dependencies.
 */

var Emitter = require('emitter');
var reduce = require('reduce');

/**
 * Root reference for iframes.
 */

var root = 'undefined' == typeof window
  ? (this || self)
  : window;

/**
 * Noop.
 */

function noop(){};

/**
 * Check if `obj` is a host object,
 * we don't want to serialize these :)
 *
 * TODO: future proof, move to compoent land
 *
 * @param {Object} obj
 * @return {Boolean}
 * @api private
 */

function isHost(obj) {
  var str = {}.toString.call(obj);

  switch (str) {
    case '[object File]':
    case '[object Blob]':
    case '[object FormData]':
      return true;
    default:
      return false;
  }
}

/**
 * Determine XHR.
 */

request.getXHR = function () {
  if (root.XMLHttpRequest
      && (!root.location || 'file:' != root.location.protocol
          || !root.ActiveXObject)) {
    return new XMLHttpRequest;
  } else {
    try { return new ActiveXObject('Microsoft.XMLHTTP'); } catch(e) {}
    try { return new ActiveXObject('Msxml2.XMLHTTP.6.0'); } catch(e) {}
    try { return new ActiveXObject('Msxml2.XMLHTTP.3.0'); } catch(e) {}
    try { return new ActiveXObject('Msxml2.XMLHTTP'); } catch(e) {}
  }
  return false;
};

/**
 * Removes leading and trailing whitespace, added to support IE.
 *
 * @param {String} s
 * @return {String}
 * @api private
 */

var trim = ''.trim
  ? function(s) { return s.trim(); }
  : function(s) { return s.replace(/(^\s*|\s*$)/g, ''); };

/**
 * Check if `obj` is an object.
 *
 * @param {Object} obj
 * @return {Boolean}
 * @api private
 */

function isObject(obj) {
  return obj === Object(obj);
}

/**
 * Serialize the given `obj`.
 *
 * @param {Object} obj
 * @return {String}
 * @api private
 */

function serialize(obj) {
  if (!isObject(obj)) return obj;
  var pairs = [];
  for (var key in obj) {
    if (null != obj[key]) {
      pairs.push(encodeURIComponent(key)
        + '=' + encodeURIComponent(obj[key]));
    }
  }
  return pairs.join('&');
}

/**
 * Expose serialization method.
 */

 request.serializeObject = serialize;

 /**
  * Parse the given x-www-form-urlencoded `str`.
  *
  * @param {String} str
  * @return {Object}
  * @api private
  */

function parseString(str) {
  var obj = {};
  var pairs = str.split('&');
  var parts;
  var pair;

  for (var i = 0, len = pairs.length; i < len; ++i) {
    pair = pairs[i];
    parts = pair.split('=');
    obj[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1]);
  }

  return obj;
}

/**
 * Expose parser.
 */

request.parseString = parseString;

/**
 * Default MIME type map.
 *
 *     superagent.types.xml = 'application/xml';
 *
 */

request.types = {
  html: 'text/html',
  json: 'application/json',
  xml: 'application/xml',
  urlencoded: 'application/x-www-form-urlencoded',
  'form': 'application/x-www-form-urlencoded',
  'form-data': 'application/x-www-form-urlencoded'
};

/**
 * Default serialization map.
 *
 *     superagent.serialize['application/xml'] = function(obj){
 *       return 'generated xml here';
 *     };
 *
 */

 request.serialize = {
   'application/x-www-form-urlencoded': serialize,
   'application/json': JSON.stringify
 };

 /**
  * Default parsers.
  *
  *     superagent.parse['application/xml'] = function(str){
  *       return { object parsed from str };
  *     };
  *
  */

request.parse = {
  'application/x-www-form-urlencoded': parseString,
  'application/json': JSON.parse
};

/**
 * Parse the given header `str` into
 * an object containing the mapped fields.
 *
 * @param {String} str
 * @return {Object}
 * @api private
 */

function parseHeader(str) {
  var lines = str.split(/\r?\n/);
  var fields = {};
  var index;
  var line;
  var field;
  var val;

  lines.pop(); // trailing CRLF

  for (var i = 0, len = lines.length; i < len; ++i) {
    line = lines[i];
    index = line.indexOf(':');
    field = line.slice(0, index).toLowerCase();
    val = trim(line.slice(index + 1));
    fields[field] = val;
  }

  return fields;
}

/**
 * Return the mime type for the given `str`.
 *
 * @param {String} str
 * @return {String}
 * @api private
 */

function type(str){
  return str.split(/ *; */).shift();
};

/**
 * Return header field parameters.
 *
 * @param {String} str
 * @return {Object}
 * @api private
 */

function params(str){
  return reduce(str.split(/ *; */), function(obj, str){
    var parts = str.split(/ *= */)
      , key = parts.shift()
      , val = parts.shift();

    if (key && val) obj[key] = val;
    return obj;
  }, {});
};

/**
 * Initialize a new `Response` with the given `xhr`.
 *
 *  - set flags (.ok, .error, etc)
 *  - parse header
 *
 * Examples:
 *
 *  Aliasing `superagent` as `request` is nice:
 *
 *      request = superagent;
 *
 *  We can use the promise-like API, or pass callbacks:
 *
 *      request.get('/').end(function(res){});
 *      request.get('/', function(res){});
 *
 *  Sending data can be chained:
 *
 *      request
 *        .post('/user')
 *        .send({ name: 'tj' })
 *        .end(function(res){});
 *
 *  Or passed to `.send()`:
 *
 *      request
 *        .post('/user')
 *        .send({ name: 'tj' }, function(res){});
 *
 *  Or passed to `.post()`:
 *
 *      request
 *        .post('/user', { name: 'tj' })
 *        .end(function(res){});
 *
 * Or further reduced to a single call for simple cases:
 *
 *      request
 *        .post('/user', { name: 'tj' }, function(res){});
 *
 * @param {XMLHTTPRequest} xhr
 * @param {Object} options
 * @api private
 */

function Response(req, options) {
  options = options || {};
  this.req = req;
  this.xhr = this.req.xhr;
  // responseText is accessible only if responseType is '' or 'text' and on older browsers
  this.text = ((this.req.method !='HEAD' && (this.xhr.responseType === '' || this.xhr.responseType === 'text')) || typeof this.xhr.responseType === 'undefined')
     ? this.xhr.responseText
     : null;
  this.statusText = this.req.xhr.statusText;
  this.setStatusProperties(this.xhr.status);
  this.header = this.headers = parseHeader(this.xhr.getAllResponseHeaders());
  // getAllResponseHeaders sometimes falsely returns "" for CORS requests, but
  // getResponseHeader still works. so we get content-type even if getting
  // other headers fails.
  this.header['content-type'] = this.xhr.getResponseHeader('content-type');
  this.setHeaderProperties(this.header);
  this.body = this.req.method != 'HEAD'
    ? this.parseBody(this.text ? this.text : this.xhr.response)
    : null;
}

/**
 * Get case-insensitive `field` value.
 *
 * @param {String} field
 * @return {String}
 * @api public
 */

Response.prototype.get = function(field){
  return this.header[field.toLowerCase()];
};

/**
 * Set header related properties:
 *
 *   - `.type` the content type without params
 *
 * A response of "Content-Type: text/plain; charset=utf-8"
 * will provide you with a `.type` of "text/plain".
 *
 * @param {Object} header
 * @api private
 */

Response.prototype.setHeaderProperties = function(header){
  // content-type
  var ct = this.header['content-type'] || '';
  this.type = type(ct);

  // params
  var obj = params(ct);
  for (var key in obj) this[key] = obj[key];
};

/**
 * Parse the given body `str`.
 *
 * Used for auto-parsing of bodies. Parsers
 * are defined on the `superagent.parse` object.
 *
 * @param {String} str
 * @return {Mixed}
 * @api private
 */

Response.prototype.parseBody = function(str){
  var parse = request.parse[this.type];
  return parse && str && (str.length || str instanceof Object)
    ? parse(str)
    : null;
};

/**
 * Set flags such as `.ok` based on `status`.
 *
 * For example a 2xx response will give you a `.ok` of __true__
 * whereas 5xx will be __false__ and `.error` will be __true__. The
 * `.clientError` and `.serverError` are also available to be more
 * specific, and `.statusType` is the class of error ranging from 1..5
 * sometimes useful for mapping respond colors etc.
 *
 * "sugar" properties are also defined for common cases. Currently providing:
 *
 *   - .noContent
 *   - .badRequest
 *   - .unauthorized
 *   - .notAcceptable
 *   - .notFound
 *
 * @param {Number} status
 * @api private
 */

Response.prototype.setStatusProperties = function(status){
  // handle IE9 bug: http://stackoverflow.com/questions/10046972/msie-returns-status-code-of-1223-for-ajax-request
  if (status === 1223) {
    status = 204;
  }

  var type = status / 100 | 0;

  // status / class
  this.status = status;
  this.statusType = type;

  // basics
  this.info = 1 == type;
  this.ok = 2 == type;
  this.clientError = 4 == type;
  this.serverError = 5 == type;
  this.error = (4 == type || 5 == type)
    ? this.toError()
    : false;

  // sugar
  this.accepted = 202 == status;
  this.noContent = 204 == status;
  this.badRequest = 400 == status;
  this.unauthorized = 401 == status;
  this.notAcceptable = 406 == status;
  this.notFound = 404 == status;
  this.forbidden = 403 == status;
};

/**
 * Return an `Error` representative of this response.
 *
 * @return {Error}
 * @api public
 */

Response.prototype.toError = function(){
  var req = this.req;
  var method = req.method;
  var url = req.url;

  var msg = 'cannot ' + method + ' ' + url + ' (' + this.status + ')';
  var err = new Error(msg);
  err.status = this.status;
  err.method = method;
  err.url = url;

  return err;
};

/**
 * Expose `Response`.
 */

request.Response = Response;

/**
 * Initialize a new `Request` with the given `method` and `url`.
 *
 * @param {String} method
 * @param {String} url
 * @api public
 */

function Request(method, url) {
  var self = this;
  Emitter.call(this);
  this._query = this._query || [];
  this.method = method;
  this.url = url;
  this.header = {};
  this._header = {};
  this.on('end', function(){
    var err = null;
    var res = null;

    try {
      res = new Response(self);
    } catch(e) {
      err = new Error('Parser is unable to parse the response');
      err.parse = true;
      err.original = e;
      return self.callback(err);
    }

    self.emit('response', res);

    if (err) {
      return self.callback(err, res);
    }

    if (res.status >= 200 && res.status < 300) {
      return self.callback(err, res);
    }

    var new_err = new Error(res.statusText || 'Unsuccessful HTTP response');
    new_err.original = err;
    new_err.response = res;
    new_err.status = res.status;

    self.callback(err || new_err, res);
  });
}

/**
 * Mixin `Emitter`.
 */

Emitter(Request.prototype);

/**
 * Allow for extension
 */

Request.prototype.use = function(fn) {
  fn(this);
  return this;
}

/**
 * Set timeout to `ms`.
 *
 * @param {Number} ms
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.timeout = function(ms){
  this._timeout = ms;
  return this;
};

/**
 * Clear previous timeout.
 *
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.clearTimeout = function(){
  this._timeout = 0;
  clearTimeout(this._timer);
  return this;
};

/**
 * Abort the request, and clear potential timeout.
 *
 * @return {Request}
 * @api public
 */

Request.prototype.abort = function(){
  if (this.aborted) return;
  this.aborted = true;
  this.xhr.abort();
  this.clearTimeout();
  this.emit('abort');
  return this;
};

/**
 * Set header `field` to `val`, or multiple fields with one object.
 *
 * Examples:
 *
 *      req.get('/')
 *        .set('Accept', 'application/json')
 *        .set('X-API-Key', 'foobar')
 *        .end(callback);
 *
 *      req.get('/')
 *        .set({ Accept: 'application/json', 'X-API-Key': 'foobar' })
 *        .end(callback);
 *
 * @param {String|Object} field
 * @param {String} val
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.set = function(field, val){
  if (isObject(field)) {
    for (var key in field) {
      this.set(key, field[key]);
    }
    return this;
  }
  this._header[field.toLowerCase()] = val;
  this.header[field] = val;
  return this;
};

/**
 * Remove header `field`.
 *
 * Example:
 *
 *      req.get('/')
 *        .unset('User-Agent')
 *        .end(callback);
 *
 * @param {String} field
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.unset = function(field){
  delete this._header[field.toLowerCase()];
  delete this.header[field];
  return this;
};

/**
 * Get case-insensitive header `field` value.
 *
 * @param {String} field
 * @return {String}
 * @api private
 */

Request.prototype.getHeader = function(field){
  return this._header[field.toLowerCase()];
};

/**
 * Set Content-Type to `type`, mapping values from `request.types`.
 *
 * Examples:
 *
 *      superagent.types.xml = 'application/xml';
 *
 *      request.post('/')
 *        .type('xml')
 *        .send(xmlstring)
 *        .end(callback);
 *
 *      request.post('/')
 *        .type('application/xml')
 *        .send(xmlstring)
 *        .end(callback);
 *
 * @param {String} type
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.type = function(type){
  this.set('Content-Type', request.types[type] || type);
  return this;
};

/**
 * Set Accept to `type`, mapping values from `request.types`.
 *
 * Examples:
 *
 *      superagent.types.json = 'application/json';
 *
 *      request.get('/agent')
 *        .accept('json')
 *        .end(callback);
 *
 *      request.get('/agent')
 *        .accept('application/json')
 *        .end(callback);
 *
 * @param {String} accept
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.accept = function(type){
  this.set('Accept', request.types[type] || type);
  return this;
};

/**
 * Set Authorization field value with `user` and `pass`.
 *
 * @param {String} user
 * @param {String} pass
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.auth = function(user, pass){
  var str = btoa(user + ':' + pass);
  this.set('Authorization', 'Basic ' + str);
  return this;
};

/**
* Add query-string `val`.
*
* Examples:
*
*   request.get('/shoes')
*     .query('size=10')
*     .query({ color: 'blue' })
*
* @param {Object|String} val
* @return {Request} for chaining
* @api public
*/

Request.prototype.query = function(val){
  if ('string' != typeof val) val = serialize(val);
  if (val) this._query.push(val);
  return this;
};

/**
 * Write the field `name` and `val` for "multipart/form-data"
 * request bodies.
 *
 * ``` js
 * request.post('/upload')
 *   .field('foo', 'bar')
 *   .end(callback);
 * ```
 *
 * @param {String} name
 * @param {String|Blob|File} val
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.field = function(name, val){
  if (!this._formData) this._formData = new root.FormData();
  this._formData.append(name, val);
  return this;
};

/**
 * Queue the given `file` as an attachment to the specified `field`,
 * with optional `filename`.
 *
 * ``` js
 * request.post('/upload')
 *   .attach(new Blob(['<a id="a"><b id="b">hey!</b></a>'], { type: "text/html"}))
 *   .end(callback);
 * ```
 *
 * @param {String} field
 * @param {Blob|File} file
 * @param {String} filename
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.attach = function(field, file, filename){
  if (!this._formData) this._formData = new root.FormData();
  this._formData.append(field, file, filename);
  return this;
};

/**
 * Send `data`, defaulting the `.type()` to "json" when
 * an object is given.
 *
 * Examples:
 *
 *       // querystring
 *       request.get('/search')
 *         .end(callback)
 *
 *       // multiple data "writes"
 *       request.get('/search')
 *         .send({ search: 'query' })
 *         .send({ range: '1..5' })
 *         .send({ order: 'desc' })
 *         .end(callback)
 *
 *       // manual json
 *       request.post('/user')
 *         .type('json')
 *         .send('{"name":"tj"})
 *         .end(callback)
 *
 *       // auto json
 *       request.post('/user')
 *         .send({ name: 'tj' })
 *         .end(callback)
 *
 *       // manual x-www-form-urlencoded
 *       request.post('/user')
 *         .type('form')
 *         .send('name=tj')
 *         .end(callback)
 *
 *       // auto x-www-form-urlencoded
 *       request.post('/user')
 *         .type('form')
 *         .send({ name: 'tj' })
 *         .end(callback)
 *
 *       // defaults to x-www-form-urlencoded
  *      request.post('/user')
  *        .send('name=tobi')
  *        .send('species=ferret')
  *        .end(callback)
 *
 * @param {String|Object} data
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.send = function(data){
  var obj = isObject(data);
  var type = this.getHeader('Content-Type');

  // merge
  if (obj && isObject(this._data)) {
    for (var key in data) {
      this._data[key] = data[key];
    }
  } else if ('string' == typeof data) {
    if (!type) this.type('form');
    type = this.getHeader('Content-Type');
    if ('application/x-www-form-urlencoded' == type) {
      this._data = this._data
        ? this._data + '&' + data
        : data;
    } else {
      this._data = (this._data || '') + data;
    }
  } else {
    this._data = data;
  }

  if (!obj || isHost(data)) return this;
  if (!type) this.type('json');
  return this;
};

/**
 * Invoke the callback with `err` and `res`
 * and handle arity check.
 *
 * @param {Error} err
 * @param {Response} res
 * @api private
 */

Request.prototype.callback = function(err, res){
  var fn = this._callback;
  this.clearTimeout();
  fn(err, res);
};

/**
 * Invoke callback with x-domain error.
 *
 * @api private
 */

Request.prototype.crossDomainError = function(){
  var err = new Error('Origin is not allowed by Access-Control-Allow-Origin');
  err.crossDomain = true;
  this.callback(err);
};

/**
 * Invoke callback with timeout error.
 *
 * @api private
 */

Request.prototype.timeoutError = function(){
  var timeout = this._timeout;
  var err = new Error('timeout of ' + timeout + 'ms exceeded');
  err.timeout = timeout;
  this.callback(err);
};

/**
 * Enable transmission of cookies with x-domain requests.
 *
 * Note that for this to work the origin must not be
 * using "Access-Control-Allow-Origin" with a wildcard,
 * and also must set "Access-Control-Allow-Credentials"
 * to "true".
 *
 * @api public
 */

Request.prototype.withCredentials = function(){
  this._withCredentials = true;
  return this;
};

/**
 * Initiate request, invoking callback `fn(res)`
 * with an instanceof `Response`.
 *
 * @param {Function} fn
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.end = function(fn){
  var self = this;
  var xhr = this.xhr = request.getXHR();
  var query = this._query.join('&');
  var timeout = this._timeout;
  var data = this._formData || this._data;

  // store callback
  this._callback = fn || noop;

  // state change
  xhr.onreadystatechange = function(){
    if (4 != xhr.readyState) return;

    // In IE9, reads to any property (e.g. status) off of an aborted XHR will
    // result in the error "Could not complete the operation due to error c00c023f"
    var status;
    try { status = xhr.status } catch(e) { status = 0; }

    if (0 == status) {
      if (self.timedout) return self.timeoutError();
      if (self.aborted) return;
      return self.crossDomainError();
    }
    self.emit('end');
  };

  // progress
  var handleProgress = function(e){
    if (e.total > 0) {
      e.percent = e.loaded / e.total * 100;
    }
    self.emit('progress', e);
  };
  if (this.hasListeners('progress')) {
    xhr.onprogress = handleProgress;
  }
  try {
    if (xhr.upload && this.hasListeners('progress')) {
      xhr.upload.onprogress = handleProgress;
    }
  } catch(e) {
    // Accessing xhr.upload fails in IE from a web worker, so just pretend it doesn't exist.
    // Reported here:
    // https://connect.microsoft.com/IE/feedback/details/837245/xmlhttprequest-upload-throws-invalid-argument-when-used-from-web-worker-context
  }

  // timeout
  if (timeout && !this._timer) {
    this._timer = setTimeout(function(){
      self.timedout = true;
      self.abort();
    }, timeout);
  }

  // querystring
  if (query) {
    query = request.serializeObject(query);
    this.url += ~this.url.indexOf('?')
      ? '&' + query
      : '?' + query;
  }

  // initiate request
  xhr.open(this.method, this.url, true);

  // CORS
  if (this._withCredentials) xhr.withCredentials = true;

  // body
  if ('GET' != this.method && 'HEAD' != this.method && 'string' != typeof data && !isHost(data)) {
    // serialize stuff
    var serialize = request.serialize[this.getHeader('Content-Type')];
    if (serialize) data = serialize(data);
  }

  // set header fields
  for (var field in this.header) {
    if (null == this.header[field]) continue;
    xhr.setRequestHeader(field, this.header[field]);
  }

  // send stuff
  this.emit('request', this);
  xhr.send(data);
  return this;
};

/**
 * Expose `Request`.
 */

request.Request = Request;

/**
 * Issue a request:
 *
 * Examples:
 *
 *    request('GET', '/users').end(callback)
 *    request('/users').end(callback)
 *    request('/users', callback)
 *
 * @param {String} method
 * @param {String|Function} url or callback
 * @return {Request}
 * @api public
 */

function request(method, url) {
  // callback
  if ('function' == typeof url) {
    return new Request('GET', method).end(url);
  }

  // url first
  if (1 == arguments.length) {
    return new Request('GET', method);
  }

  return new Request(method, url);
}

/**
 * GET `url` with optional callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed|Function} data or fn
 * @param {Function} fn
 * @return {Request}
 * @api public
 */

request.get = function(url, data, fn){
  var req = request('GET', url);
  if ('function' == typeof data) fn = data, data = null;
  if (data) req.query(data);
  if (fn) req.end(fn);
  return req;
};

/**
 * HEAD `url` with optional callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed|Function} data or fn
 * @param {Function} fn
 * @return {Request}
 * @api public
 */

request.head = function(url, data, fn){
  var req = request('HEAD', url);
  if ('function' == typeof data) fn = data, data = null;
  if (data) req.send(data);
  if (fn) req.end(fn);
  return req;
};

/**
 * DELETE `url` with optional callback `fn(res)`.
 *
 * @param {String} url
 * @param {Function} fn
 * @return {Request}
 * @api public
 */

request.del = function(url, fn){
  var req = request('DELETE', url);
  if (fn) req.end(fn);
  return req;
};

/**
 * PATCH `url` with optional `data` and callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed} data
 * @param {Function} fn
 * @return {Request}
 * @api public
 */

request.patch = function(url, data, fn){
  var req = request('PATCH', url);
  if ('function' == typeof data) fn = data, data = null;
  if (data) req.send(data);
  if (fn) req.end(fn);
  return req;
};

/**
 * POST `url` with optional `data` and callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed} data
 * @param {Function} fn
 * @return {Request}
 * @api public
 */

request.post = function(url, data, fn){
  var req = request('POST', url);
  if ('function' == typeof data) fn = data, data = null;
  if (data) req.send(data);
  if (fn) req.end(fn);
  return req;
};

/**
 * PUT `url` with optional `data` and callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed|Function} data or fn
 * @param {Function} fn
 * @return {Request}
 * @api public
 */

request.put = function(url, data, fn){
  var req = request('PUT', url);
  if ('function' == typeof data) fn = data, data = null;
  if (data) req.send(data);
  if (fn) req.end(fn);
  return req;
};

/**
 * Expose `request`.
 */

module.exports = request;

},{"emitter":2,"reduce":3}],2:[function(require,module,exports){

/**
 * Expose `Emitter`.
 */

module.exports = Emitter;

/**
 * Initialize a new `Emitter`.
 *
 * @api public
 */

function Emitter(obj) {
  if (obj) return mixin(obj);
};

/**
 * Mixin the emitter properties.
 *
 * @param {Object} obj
 * @return {Object}
 * @api private
 */

function mixin(obj) {
  for (var key in Emitter.prototype) {
    obj[key] = Emitter.prototype[key];
  }
  return obj;
}

/**
 * Listen on the given `event` with `fn`.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.on =
Emitter.prototype.addEventListener = function(event, fn){
  this._callbacks = this._callbacks || {};
  (this._callbacks[event] = this._callbacks[event] || [])
    .push(fn);
  return this;
};

/**
 * Adds an `event` listener that will be invoked a single
 * time then automatically removed.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.once = function(event, fn){
  var self = this;
  this._callbacks = this._callbacks || {};

  function on() {
    self.off(event, on);
    fn.apply(this, arguments);
  }

  on.fn = fn;
  this.on(event, on);
  return this;
};

/**
 * Remove the given callback for `event` or all
 * registered callbacks.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.off =
Emitter.prototype.removeListener =
Emitter.prototype.removeAllListeners =
Emitter.prototype.removeEventListener = function(event, fn){
  this._callbacks = this._callbacks || {};

  // all
  if (0 == arguments.length) {
    this._callbacks = {};
    return this;
  }

  // specific event
  var callbacks = this._callbacks[event];
  if (!callbacks) return this;

  // remove all handlers
  if (1 == arguments.length) {
    delete this._callbacks[event];
    return this;
  }

  // remove specific handler
  var cb;
  for (var i = 0; i < callbacks.length; i++) {
    cb = callbacks[i];
    if (cb === fn || cb.fn === fn) {
      callbacks.splice(i, 1);
      break;
    }
  }
  return this;
};

/**
 * Emit `event` with the given args.
 *
 * @param {String} event
 * @param {Mixed} ...
 * @return {Emitter}
 */

Emitter.prototype.emit = function(event){
  this._callbacks = this._callbacks || {};
  var args = [].slice.call(arguments, 1)
    , callbacks = this._callbacks[event];

  if (callbacks) {
    callbacks = callbacks.slice(0);
    for (var i = 0, len = callbacks.length; i < len; ++i) {
      callbacks[i].apply(this, args);
    }
  }

  return this;
};

/**
 * Return array of callbacks for `event`.
 *
 * @param {String} event
 * @return {Array}
 * @api public
 */

Emitter.prototype.listeners = function(event){
  this._callbacks = this._callbacks || {};
  return this._callbacks[event] || [];
};

/**
 * Check if this emitter has `event` handlers.
 *
 * @param {String} event
 * @return {Boolean}
 * @api public
 */

Emitter.prototype.hasListeners = function(event){
  return !! this.listeners(event).length;
};

},{}],3:[function(require,module,exports){

/**
 * Reduce `arr` with `fn`.
 *
 * @param {Array} arr
 * @param {Function} fn
 * @param {Mixed} initial
 *
 * TODO: combatible error handling?
 */

module.exports = function(arr, fn, initial){  
  var idx = 0;
  var len = arr.length;
  var curr = arguments.length == 3
    ? initial
    : arr[idx++];

  while (idx < len) {
    curr = fn.call(null, curr, arr[idx], ++idx, arr);
  }
  
  return curr;
};
},{}]},{},[1])(1)
});
/*globals define, escape*/
/*jshint browser: true, node:true*/

/**
 * Client module for accessing the blob.
 *
 * @author lattmann / https://github.com/lattmann
 * @author ksmyth / https://github.com/ksmyth
 */

define('blob/BlobClient',['blob/Artifact', 'blob/BlobMetadata', 'superagent'], function (Artifact, BlobMetadata, superagent) {
    

    var BlobClient = function (parameters) {
        this.artifacts = [];

        if (parameters) {
            this.server = parameters.server || this.server;
            this.serverPort = parameters.serverPort || this.serverPort;
            this.httpsecure = (parameters.httpsecure !== undefined) ? parameters.httpsecure : this.httpsecure;
            this.webgmeclientsession = parameters.webgmeclientsession;
            this.keepaliveAgentOptions = parameters.keepaliveAgentOptions || { /* use defaults */ };
        } else {
            this.keepaliveAgentOptions = { /* use defaults */ };
        }
        this.blobUrl = '';
        if (this.httpsecure !== undefined && this.server && this.serverPort) {
            this.blobUrl = (this.httpsecure ? 'https://' : 'http://') + this.server + ':' + this.serverPort;
        }

        // TODO: TOKEN???
        this.blobUrl = this.blobUrl + '/rest/blob/'; // TODO: any ways to ask for this or get it from the configuration?

        this.isNodeOrNodeWebKit = typeof process !== 'undefined';
        if (this.isNodeOrNodeWebKit) {
            // node or node-webkit
            if (this.httpsecure) {
                this.Agent = require('agentkeepalive').HttpsAgent;
            } else {
                this.Agent = require('agentkeepalive');
            }
            if (this.keepaliveAgentOptions.hasOwnProperty('ca') === false) {
                this.keepaliveAgentOptions.ca = require('https').globalAgent.options.ca;
            }
            this.keepaliveAgent = new this.Agent(this.keepaliveAgentOptions);
        }
    };

    BlobClient.prototype.getMetadataURL = function (hash) {
        var metadataBase = this.blobUrl + 'metadata';
        if (hash) {
            return metadataBase + '/' + hash;
        } else {
            return metadataBase;
        }
    };

    BlobClient.prototype._getURL = function (base, hash, subpath) {
        var subpathURL = '';
        if (subpath) {
            subpathURL = subpath;
        }
        return this.blobUrl + base + '/' + hash + '/' + encodeURIComponent(subpathURL);
    };

    BlobClient.prototype.getViewURL = function (hash, subpath) {
        return this._getURL('view', hash, subpath);
    };

    BlobClient.prototype.getDownloadURL = function (hash, subpath) {
        return this._getURL('download', hash, subpath);
    };

    BlobClient.prototype.getCreateURL = function (filename, isMetadata) {
        if (isMetadata) {
            return this.blobUrl + 'createMetadata/';
        } else {
            return this.blobUrl + 'createFile/' + encodeURIComponent(filename);
        }
    };

    BlobClient.prototype.putFile = function (name, data, callback) {
        var contentLength,
            req;

        function toArrayBuffer(buffer) {
            var ab = new ArrayBuffer(buffer.length);
            var view = new Uint8Array(ab);
            for (var i = 0; i < buffer.length; ++i) {
                view[i] = buffer[i];
            }
            return ab;
        }

        // On node-webkit, we use XMLHttpRequest, but xhr.send thinks a Buffer is a string and encodes it in utf-8 -
        // send an ArrayBuffer instead.
        if (typeof window !== 'undefined' && typeof Buffer !== 'undefined' && data instanceof Buffer) {
            data = toArrayBuffer(data); // FIXME will this have performance problems
        }
        // on node, empty Buffers will cause a crash in superagent
        if (typeof window === 'undefined' && typeof Buffer !== 'undefined' && data instanceof Buffer) {
            if (data.length === 0) {
                data = '';
            }
        }
        contentLength = data.hasOwnProperty('length') ? data.length : data.byteLength;
        req = superagent.post(this.getCreateURL(name));

        if (typeof window === 'undefined') {
            req.agent(this.keepaliveAgent);
        }

        if (this.webgmeclientsession) {
            req.set('webgmeclientsession', this.webgmeclientsession);
        }
        if (typeof data !== 'string' && !(data instanceof String)) {
            req.set('Content-Length', contentLength)
        }
        req.set('Content-Type', 'application/octet-stream')
            .send(data)
            .end(function (err, res) {
                if (err || res.status > 399) {
                    callback(err || res.status);
                    return;
                }
                var response = res.body;
                // Get the first one
                var hash = Object.keys(response)[0];
                callback(null, hash);
            });
    };

    BlobClient.prototype.putMetadata = function (metadataDescriptor, callback) {
        var metadata = new BlobMetadata(metadataDescriptor),
            blob,
            contentLength,
            req;
        // FIXME: in production mode do not indent the json file.
        if (typeof Blob !== 'undefined') {
            blob = new Blob([JSON.stringify(metadata.serialize(), null, 4)], {type: 'text/plain'});
            contentLength = blob.size;
        } else {
            blob = new Buffer(JSON.stringify(metadata.serialize(), null, 4), 'utf8');
            contentLength = blob.length;
        }

        req = superagent.post(this.getCreateURL(metadataDescriptor.name, true));
        if (this.webgmeclientsession) {
            req.set('webgmeclientsession', this.webgmeclientsession);
        }

        if (typeof window === 'undefined') {
            req.agent(this.keepaliveAgent);
        }

        req.set('Content-Type', 'application/octet-stream')
            .set('Content-Length', contentLength)
            .send(blob)
            .end(function (err, res) {
                if (err || res.status > 399) {
                    callback(err || res.status);
                    return;
                }
                // Uploaded.
                var response = JSON.parse(res.text);
                // Get the first one
                var hash = Object.keys(response)[0];
                callback(null, hash);
            });
    };

    BlobClient.prototype.putFiles = function (o, callback) {
        var self = this,
            error = '',
            filenames = Object.keys(o),
            remaining = filenames.length,
            hashes = {},
            putFile;
        if (remaining === 0) {
            callback(null, hashes);
        }
        putFile = function (filename, data) {
            self.putFile(filename, data, function (err, hash) {
                remaining -= 1;

                hashes[filename] = hash;

                if (err) {
                    error += 'putFile error: ' + err.toString();
                }

                if (remaining === 0) {
                    callback(error, hashes);
                }
            });
        };

        for (var j = 0; j < filenames.length; j += 1) {
            putFile(filenames[j], o[filenames[j]]);
        }
    };

    BlobClient.prototype.getSubObject = function (hash, subpath, callback) {
        return this.getObject(hash, callback, subpath);
    };

    BlobClient.prototype.getObject = function (hash, callback, subpath) {
        superagent.parse['application/zip'] = function (obj, parseCallback) {
            if (parseCallback) {
                // Running on node; this should be unreachable due to req.pipe() below
            } else {
                return obj;
            }
        };
        //superagent.parse['application/json'] = superagent.parse['application/zip'];

        var req = superagent.get(this.getViewURL(hash, subpath));
        if (this.webgmeclientsession) {
            req.set('webgmeclientsession', this.webgmeclientsession);
        }

        if (typeof window === 'undefined') {
            req.agent(this.keepaliveAgent);
        }

        if (req.pipe) {
            // running on node
            var Writable = require('stream').Writable;
            var BuffersWritable = function (options) {
                Writable.call(this, options);

                var self = this;
                self.buffers = [];
            };
            require('util').inherits(BuffersWritable, Writable);

            BuffersWritable.prototype._write = function (chunk, encoding, callback) {
                this.buffers.push(chunk);
                callback();
            };

            var buffers = new BuffersWritable();
            buffers.on('finish', function () {
                if (req.req.res.statusCode > 399) {
                    return callback(req.req.res.statusCode);
                }
                callback(null, Buffer.concat(buffers.buffers));
            });
            buffers.on('error', function (err) {
                callback(err);
            });
            req.pipe(buffers);
        } else {
            req.removeAllListeners('end');
            req.on('request', function () {
                if (typeof this.xhr !== 'undefined') {
                    this.xhr.responseType = 'arraybuffer';
                }
            });
            // req.on('error', callback);
            req.on('end', function () {
                if (req.xhr.status > 399) {
                    callback(req.xhr.status);
                } else {
                    var contentType = req.xhr.getResponseHeader('content-type');
                    var response = req.xhr.response; // response is an arraybuffer
                    if (contentType === 'application/json') {
                        var utf8ArrayToString = function (uintArray) {
                            var inputString = '',
                                i;
                            for (i = 0; i < uintArray.byteLength; i++) {
                                inputString += String.fromCharCode(uintArray[i]);
                            }
                            return decodeURIComponent(escape(inputString));
                        };
                        response = JSON.parse(utf8ArrayToString(new Uint8Array(response)));
                    }
                    callback(null, response);
                }
            });
            req.end(callback);
        }
    };

    BlobClient.prototype.getMetadata = function (hash, callback) {
        var req = superagent.get(this.getMetadataURL(hash));
        if (this.webgmeclientsession) {
            req.set('webgmeclientsession', this.webgmeclientsession);
        }

        if (typeof window === 'undefined') {
            req.agent(this.keepaliveAgent);
        }

        req.end(function (err, res) {
            if (err || res.status > 399) {
                callback(err || res.status);
            } else {
                callback(null, JSON.parse(res.text));
            }
        });
    };

    BlobClient.prototype.createArtifact = function (name) {
        var artifact = new Artifact(name, this);
        this.artifacts.push(artifact);
        return artifact;
    };

    BlobClient.prototype.getArtifact = function (metadataHash, callback) {
        // TODO: get info check if complex flag is set to true.
        // TODO: get info get name.
        var self = this;
        this.getMetadata(metadataHash, function (err, info) {
            if (err) {
                callback(err);
                return;
            }

            if (info.contentType === BlobMetadata.CONTENT_TYPES.COMPLEX) {
                var artifact = new Artifact(info.name, self, info);
                self.artifacts.push(artifact);
                callback(null, artifact);
            } else {
                callback('not supported contentType ' + JSON.stringify(info, null, 4));
            }

        });
    };

    BlobClient.prototype.saveAllArtifacts = function (callback) {
        var remaining = this.artifacts.length,
            hashes = [],
            error = '',
            saveCallback;

        if (remaining === 0) {
            callback(null, hashes);
        }

        saveCallback = function (err, hash) {
            remaining -= 1;

            hashes.push(hash);

            if (err) {
                error += 'artifact.save err: ' + err.toString();
            }
            if (remaining === 0) {
                callback(error, hashes);
            }
        };

        for (var i = 0; i < this.artifacts.length; i += 1) {

            this.artifacts[i].save(saveCallback);
        }
    };

    return BlobClient;
});

/*globals define*/
/*jshint browser: true, node:true*/

/**
 * Client module for creating, monitoring executor jobs.
 *
 * @author lattmann / https://github.com/lattmann
 * @author ksmyth / https://github.com/ksmyth
 */


define('executor/ExecutorClient',['superagent'], function (superagent) {
    

    var ExecutorClient = function (parameters) {
        parameters = parameters || {};
        this.isNodeJS = (typeof window === 'undefined') && (typeof process === 'object');
        this.isNodeWebkit = (typeof window === 'object') && (typeof process === 'object');
        //console.log(isNode);
        if (this.isNodeJS) {
            this.server = '127.0.0.1';
            this._clientSession = null; // parameters.sessionId;;
        }
        this.server = parameters.server || this.server;
        this.serverPort = parameters.serverPort || this.serverPort;
        this.httpsecure = (parameters.httpsecure !== undefined) ? parameters.httpsecure : this.httpsecure;
        if (this.isNodeJS) {
            this.http = this.httpsecure ? require('https') : require('http');
        }
        this.executorUrl = '';
        if (this.httpsecure !== undefined && this.server && this.serverPort) {
            this.executorUrl = (this.httpsecure ? 'https://' : 'http://') + this.server + ':' + this.serverPort;
        }
        // TODO: TOKEN???
        // TODO: any ways to ask for this or get it from the configuration?
        this.executorUrl = this.executorUrl + '/rest/executor/';
        if (parameters.executorNonce) {
            this.executorNonce = parameters.executorNonce;
        }
    };

    ExecutorClient.prototype.getInfoURL = function (hash) {
        var metadataBase = this.executorUrl + 'info';
        if (hash) {
            return metadataBase + '/' + hash;
        } else {
            return metadataBase;
        }
    };


    ExecutorClient.prototype.getCreateURL = function (hash) {
        var metadataBase = this.executorUrl + 'create';
        if (hash) {
            return metadataBase + '/' + hash;
        } else {
            return metadataBase;
        }
    };

    ExecutorClient.prototype.createJob = function (jobInfo, callback) {
        if (typeof jobInfo === 'string') {
            jobInfo = { hash: jobInfo }; // old API
        }
        this.sendHttpRequestWithData('POST', this.getCreateURL(jobInfo.hash), jobInfo, function (err, response) {
            if (err) {
                callback(err);
                return;
            }

            callback(null, JSON.parse(response));
        });
    };

    ExecutorClient.prototype.updateJob = function (jobInfo, callback) {
        this.sendHttpRequestWithData('POST', this.executorUrl + 'update/' + jobInfo.hash, jobInfo,
            function (err, response) {
                if (err) {
                    callback(err);
                    return;
                }

                callback(null, response);
            }
        );
    };

    ExecutorClient.prototype.getInfo = function (hash, callback) {
        this.sendHttpRequest('GET', this.getInfoURL(hash), function (err, response) {
            if (err) {
                callback(err);
                return;
            }

            callback(null, JSON.parse(response));
        });
    };

    ExecutorClient.prototype.getAllInfo = function (callback) {

        this.sendHttpRequest('GET', this.getInfoURL(), function (err, response) {
            if (err) {
                callback(err);
                return;
            }

            callback(null, JSON.parse(response));
        });
    };

    ExecutorClient.prototype.getInfoByStatus = function (status, callback) {

        this.sendHttpRequest('GET', this.executorUrl + '?status=' + status, function (err, response) {
            if (err) {
                callback(err);
                return;
            }

            callback(null, JSON.parse(response));
        });
    };

    ExecutorClient.prototype.getWorkersInfo = function (callback) {

        this.sendHttpRequest('GET', this.executorUrl + 'worker', function (err, response) {
            if (err) {
                callback(err);
                return;
            }

            callback(null, JSON.parse(response));
        });
    };

    ExecutorClient.prototype.sendHttpRequest = function (method, url, callback) {
        return this.sendHttpRequestWithData(method, url, null, callback);
    };

    ExecutorClient.prototype.sendHttpRequestWithData = function (method, url, data, callback) {
        var req = new superagent.Request(method, url);
        if (this.executorNonce) {
            req.set('x-executor-nonce', this.executorNonce);
        }
        if (data) {
            req.send(data);
        }
        req.end(function (err, res) {
            if (err) {
                callback(err);
                return;
            }
            if (res.status > 399) {
                callback(res.status, res.text);
            } else {
                callback(null, res.text);
            }
        });
    };

    ExecutorClient.prototype._ensureAuthenticated = function (options, callback) {
        //this function enables the session of the client to be authenticated
        //TODO currently this user does not have a session, so it has to upgrade the options always!!!
//        if (options.headers) {
//            options.headers.webgmeclientsession = this._clientSession;
//        } else {
//            options.headers = {
//                'webgmeclientsession': this._clientSession
//            }
//        }
        callback(null, options);
    };

    return ExecutorClient;
});

/*globals define*/
/*jshint browser: true, node:true*/

/**
 * @author lattmann / https://github.com/lattmann
 */

define('plugin/PluginConfig',[], function () {
    
    /**
     * Initializes a new instance of plugin configuration.
     *
     * Note: this object is JSON serializable see serialize method.
     *
     * @param config - deserializes an existing configuration to this object.
     * @constructor
     */
    var PluginConfig = function (config) {
        if (config) {
            var keys = Object.keys(config);
            for (var i = 0; i < keys.length; i += 1) {
                // TODO: check for type on deserialization
                this[keys[i]] = config[keys[i]];
            }
        }
    };

    /**
     * Serializes this object to a JSON representation.
     *
     * @returns {{}}
     */
    PluginConfig.prototype.serialize = function () {
        var keys = Object.keys(this);
        var result = {};

        for (var i = 0; i < keys.length; i += 1) {
            // TODO: check for type on serialization
            result[keys[i]] = this[keys[i]];
        }

        return result;
    };


    return PluginConfig;
});
/*globals define*/
/*jshint browser: true, node:true*/

/**
 * @author lattmann / https://github.com/lattmann
 */


define('plugin/PluginNodeDescription',[], function () {
    
    /**
     * Initializes a new instance of plugin node description object.
     *
     * Note: this object is JSON serializable see serialize method.
     *
     * @param config - deserializes an existing configuration to this object.
     * @constructor
     */
    var PluginNodeDescription = function (config) {
        if (config) {
            this.name = config.name;
            this.id = config.id;
        } else {
            this.name = '';
            this.id = '';
        }
    };

    /**
     * Serializes this object to a JSON representation.
     *
     * @returns {{}}
     */
    PluginNodeDescription.prototype.serialize = function () {
        var keys = Object.keys(this),
            result = {},
            i;

        for (i = 0; i < keys.length; i += 1) {
            // TODO: check for type on serialization
            result[keys[i]] = this[keys[i]];
        }

        return result;
    };

    return PluginNodeDescription;
});
/*globals define*/
/*jshint browser: true, node:true*/

/**
 * @author lattmann / https://github.com/lattmann
 */


define('plugin/PluginMessage',['plugin/PluginNodeDescription'], function (PluginNodeDescription) {
    

    /**
     * Initializes a new instance of plugin message.
     *
     * Note: this object is JSON serializable see serialize method.
     *
     * @param config - deserializes an existing configuration to this object.
     * @constructor
     */
    var PluginMessage = function (config) {
        if (config) {
            this.commitHash = config.commitHash;
            if (config.activeNode instanceof PluginNodeDescription) {
                this.activeNode = config.activeNode;
            } else {
                this.activeNode = new PluginNodeDescription(config.activeNode);
            }

            this.message = config.message;
            if (config.severity) {
                this.severity = config.severity;
            } else {
                this.severity = 'info';
            }
        } else {
            this.commitHash = '';
            this.activeNode = new PluginNodeDescription();
            this.message = '';
            this.severity = 'info';
        }
    };

    /**
     * Serializes this object to a JSON representation.
     *
     * @returns {{}}
     */
    PluginMessage.prototype.serialize = function () {
        var result = {
            commitHash: this.commitHash,
            activeNode: this.activeNode.serialize(),
            message: this.message,
            severity: this.severity
        };

        return result;
    };

    return PluginMessage;
});
/*globals define*/
/*jshint browser: true, node:true*/

/**
 * @author lattmann / https://github.com/lattmann
 */


define('plugin/PluginResult',['plugin/PluginMessage'], function (PluginMessage) {
    
    /**
     * Initializes a new instance of a plugin result object.
     *
     * Note: this object is JSON serializable see serialize method.
     *
     * @param config - deserializes an existing configuration to this object.
     * @constructor
     */
    var PluginResult = function (config) {
        var pluginMessage,
            i;
        if (config) {
            this.success = config.success;
            this.pluginName = config.pluginName;
            this.startTime = config.startTime;
            this.finishTime = config.finishTime;
            this.messages = [];
            this.artifacts = config.artifacts;
            this.error = config.error;
            this.commits = config.commits;

            for (i = 0; i < config.messages.length; i += 1) {
                if (config.messages[i] instanceof PluginMessage) {
                    pluginMessage = config.messages[i];
                } else {
                    pluginMessage = new PluginMessage(config.messages[i]);
                }
                this.messages.push(pluginMessage);
            }
        } else {
            this.success = false;
            this.messages = []; // array of PluginMessages
            this.artifacts = []; // array of hashes
            this.pluginName = 'PluginName N/A';
            this.startTime = null;
            this.finishTime = null;
            this.error = null;
            this.commits = [];
        }
    };

    /**
     * Gets the success flag of this result object
     *
     * @returns {boolean}
     */
    PluginResult.prototype.getSuccess = function () {
        return this.success;
    };

    /**
     * Sets the success flag of this result.
     *
     * @param {boolean} value
     */
    PluginResult.prototype.setSuccess = function (value) {
        this.success = value;
    };

    /**
     * Returns with the plugin messages.
     *
     * @returns {plugin.PluginMessage[]}
     */
    PluginResult.prototype.getMessages = function () {
        return this.messages;
    };

    /**
     * Adds a new plugin message to the messages list.
     *
     * @param {plugin.PluginMessage} pluginMessage
     */
    PluginResult.prototype.addMessage = function (pluginMessage) {
        this.messages.push(pluginMessage);
    };

    PluginResult.prototype.getArtifacts = function () {
        return this.artifacts;
    };

    PluginResult.prototype.addArtifact = function (hash) {
        this.artifacts.push(hash);
    };

    /**
     *
     * @param {object} commitData
     * @param {string} commitData.commitHash - hash of the commit.
     * @param {string} commitData.status - storage.constants./SYNCH/FORKED.
     * @param {string} commitData.branchName - name of branch that got updated with the commitHash.
     */
    PluginResult.prototype.addCommit = function (commitData) {
        this.commits.push(commitData);
    };

    /**
     * Gets the name of the plugin to which the result object belongs to.
     *
     * @returns {string}
     */
    PluginResult.prototype.getPluginName = function () {
        return this.pluginName;
    };

    //------------------------------------------------------------------------------------------------------------------
    //--------------- Methods used by the plugin manager

    /**
     * Sets the name of the plugin to which the result object belongs to.
     *
     * @param pluginName - name of the plugin
     */
    PluginResult.prototype.setPluginName = function (pluginName) {
        this.pluginName = pluginName;
    };

    /**
     * Gets the ISO 8601 representation of the time when the plugin started its execution.
     *
     * @returns {string}
     */
    PluginResult.prototype.getStartTime = function () {
        return this.startTime;
    };

    /**
     * Sets the ISO 8601 representation of the time when the plugin started its execution.
     *
     * @param {string} time
     */
    PluginResult.prototype.setStartTime = function (time) {
        this.startTime = time;
    };

    /**
     * Gets the ISO 8601 representation of the time when the plugin finished its execution.
     *
     * @returns {string}
     */
    PluginResult.prototype.getFinishTime = function () {
        return this.finishTime;
    };

    /**
     * Sets the ISO 8601 representation of the time when the plugin finished its execution.
     *
     * @param {string} time
     */
    PluginResult.prototype.setFinishTime = function (time) {
        this.finishTime = time;
    };

    /**
     * Gets error if any error occured during execution.
     * FIXME: should this be an Error object?
     * @returns {string}
     */
    PluginResult.prototype.getError = function () {
        return this.error;
    };

    /**
     * Sets the error string if any error occured during execution.
     * FIXME: should this be an Error object?
     * @param {string} time
     */
    PluginResult.prototype.setError = function (error) {
        this.error = error;
    };

    /**
     * Serializes this object to a JSON representation.
     *
     * @returns {{success: boolean, messages: plugin.PluginMessage[], pluginName: string, finishTime: stirng}}
     */
    PluginResult.prototype.serialize = function () {
        var result = {
            success: this.success,
            messages: [],
            commits: this.commits,
            artifacts: this.artifacts,
            pluginName: this.pluginName,
            startTime: this.startTime,
            finishTime: this.finishTime,
            error: this.error
        },
            i;

        for (i = 0; i < this.messages.length; i += 1) {
            result.messages.push(this.messages[i].serialize());
        }

        return result;
    };

    return PluginResult;
});
/*globals define*/
/*jshint browser: true, node:true*/

/**
 * This is the base class that plugins should inherit from.
 * (Using the plugin-generator - the generated plugin will do that.)
 *
 * @author lattmann / https://github.com/lattmann
 */

define('plugin/PluginBase',[
    'plugin/PluginConfig',
    'plugin/PluginResult',
    'plugin/PluginMessage',
    'plugin/PluginNodeDescription',
    'common/storage/constants',
], function (PluginConfig, PluginResult, PluginMessage, PluginNodeDescription, STORAGE_CONSTANTS) {
    

    /**
     * Initializes a new instance of a plugin object, which should be a derived class.
     *
     * @constructor
     */
    var PluginBase = function () {
        // set by initialize
        this.logger = null;
        this.blobClient = null;
        this._currentConfig = null;

        // set by configure
        this.core = null;
        this.project = null;
        this.projectName = null;
        this.branchName = null;
        this.branchHash = null;
        this.commitHash = null;
        this.currentHash = null;
        this.rootNode = null;
        this.activeNode = null;
        this.activeSelection = [];
        this.META = null;

        this.result = null;
        this.isConfigured = false;
        this.gmeConfig = null;
    };

    //--------------------------------------------------------------------------------------------------------------
    //---------- Methods must be overridden by the derived classes

    /**
     * Main function for the plugin to execute. This will perform the execution.
     * Notes:
     * - do NOT use console.log use this.logger.[error,warning,info,debug] instead
     * - do NOT put any user interaction logic UI, etc. inside this function
     * - callback always have to be called even if error happened
     *
     * @param {function(string, plugin.PluginResult)} callback - the result callback
     */
    PluginBase.prototype.main = function (/*callback*/) {
        throw new Error('implement this function in the derived class');
    };

    /**
     * Readable name of this plugin that can contain spaces.
     *
     * @returns {string}
     */
    PluginBase.prototype.getName = function () {
        throw new Error('implement this function in the derived class - getting type automatically is a bad idea,' +
            'when the js scripts are minified names are useless.');
    };

    //--------------------------------------------------------------------------------------------------------------
    //---------- Methods could be overridden by the derived classes

    /**
     * Current version of this plugin using semantic versioning.
     * @returns {string}
     */
    PluginBase.prototype.getVersion = function () {
        return '0.1.0';
    };

    /**
     * A detailed description of this plugin and its purpose. It can be one or more sentences.
     *
     * @returns {string}
     */
    PluginBase.prototype.getDescription = function () {
        return '';
    };

    /**
     * Configuration structure with names, descriptions, minimum, maximum values, default values and
     * type definitions.
     *
     * Example:
     *
     * [{
         *    "name": "logChildrenNames",
         *    "displayName": "Log Children Names",
         *    "description": '',
         *    "value": true, // this is the 'default config'
         *    "valueType": "boolean",
         *    "readOnly": false
         * },{
         *    "name": "logLevel",
         *    "displayName": "Logger level",
         *    "description": '',
         *    "value": "info",
         *    "valueType": "string",
         *    "valueItems": [
         *          "debug",
         *          "info",
         *          "warn",
         *          "error"
         *      ],
         *    "readOnly": false
         * },{
         *    "name": "maxChildrenToLog",
         *    "displayName": "Maximum children to log",
         *    "description": 'Set this parameter to blabla',
         *    "value": 4,
         *    "minValue": 1,
         *    "valueType": "number",
         *    "readOnly": false
         * }]
     *
     * @returns {object[]}
     */
    PluginBase.prototype.getConfigStructure = function () {
        return [];
    };

    //--------------------------------------------------------------------------------------------------------------
    //---------- Methods that can be used by the derived classes

    /**
     * Updates the current success flag with a new value.
     *
     * NewValue = OldValue && Value
     *
     * @param {boolean} value - apply this flag on current success value
     * @param {string|null} message - optional detailed message
     */
    PluginBase.prototype.updateSuccess = function (value, message) {
        var prevSuccess = this.result.getSuccess();
        var newSuccessValue = prevSuccess && value;

        this.result.setSuccess(newSuccessValue);
        var msg = '';
        if (message) {
            msg = ' - ' + message;
        }

        this.logger.debug('Success was updated from ' + prevSuccess + ' to ' + newSuccessValue + msg);
    };

    /**
     * WebGME can export the META types as path and this method updates the generated domain specific types with
     * webgme node objects. These can be used to define the base class of new objects created through the webgme API.
     *
     * @param {object} generatedMETA
     */
    PluginBase.prototype.updateMETA = function (generatedMETA) {
        var name;
        for (name in this.META) {
            if (this.META.hasOwnProperty(name)) {
                generatedMETA[name] = this.META[name];
            }
        }

        // TODO: check if names are not the same
        // TODO: log if META is out of date
    };

    /**
     * Checks if the given node is of the given meta-type.
     * Usage: <tt>self.isMetaTypeOf(aNode, self.META['FCO']);</tt>
     * @param node - Node to be checked for type.
     * @param metaNode - Node object defining the meta type.
     * @returns {boolean} - True if the given object was of the META type.
     */
    PluginBase.prototype.isMetaTypeOf = function (node, metaNode) {
        var self = this;
        while (node) {
            if (self.core.getGuid(node) === self.core.getGuid(metaNode)) {
                return true;
            }
            node = self.core.getBase(node);
        }
        return false;
    };

    /**
     * Finds and returns the node object defining the meta type for the given node.
     * @param node - Node to be checked for type.
     * @returns {Object} - Node object defining the meta type of node.
     */
    PluginBase.prototype.getMetaType = function (node) {
        var self = this,
            name;
        while (node) {
            name = self.core.getAttribute(node, 'name');
            if (self.META.hasOwnProperty(name) && self.core.getGuid(node) === self.core.getGuid(self.META[name])) {
                break;
            }
            node = self.core.getBase(node);
        }
        return node;
    };

    /**
     * Returns true if node is a direct instance of a meta-type node (or a meta-type node itself).
     * @param node - Node to be checked.
     * @returns {boolean}
     */
    PluginBase.prototype.baseIsMeta = function (node) {
        var self = this,
            baseName,
            baseNode = self.core.getBase(node);
        if (!baseNode) {
            // FCO does not have a base node, by definition function returns true.
            return true;
        }
        baseName = self.core.getAttribute(baseNode, 'name');
        return self.META.hasOwnProperty(baseName) &&
            self.core.getGuid(self.META[baseName]) === self.core.getGuid(baseNode);
    };

    /**
     * Gets the current configuration of the plugin that was set by the user and plugin manager.
     *
     * @returns {object}
     */
    PluginBase.prototype.getCurrentConfig = function () {
        return this._currentConfig;
    };

    /**
     * Creates a new message for the user and adds it to the result.
     *
     * @param {object} node - webgme object which is related to the message
     * @param {string} message - feedback to the user
     * @param {string} severity - severity level of the message: 'debug', 'info' (default), 'warning', 'error'.
     */
    PluginBase.prototype.createMessage = function (node, message, severity) {
        var severityLevel = severity || 'info';
        //this occurence of the function will always handle a single node

        var descriptor = new PluginNodeDescription({
            name: node ? this.core.getAttribute(node, 'name') : '',
            id: node ? this.core.getPath(node) : ''
        });
        var pluginMessage = new PluginMessage({
            commitHash: this.currentHash,
            activeNode: descriptor,
            message: message,
            severity: severityLevel
        });

        this.result.addMessage(pluginMessage);
    };

    /**
     * Saves all current changes if there is any to a new commit.
     * If the changes were started from a branch, then tries to fast forward the branch to the new commit.
     * Note: Does NOT handle any merges at this point.
     *
     * @param {string|null} message - commit message
     * @param callback
     */
    PluginBase.prototype.save = function (message, callback) {
        var self = this,
            persisted,
            commitMessage = '[Plugin] ' + self.getName() + ' (v' + self.getVersion() + ') updated the model.';

        commitMessage = message ? commitMessage + ' - ' + message : commitMessage;

        self.logger.debug('Saving project');
        persisted = self.core.persist(self.rootNode);
        if (Object.keys(persisted.objects).length === 0) {
            self.logger.warn('save invoked with no changes, will still proceed');
        }
        if (self.branch) {
            self._commitWithClient(persisted, commitMessage, callback);
        } else {
            // Make commit w/o depending on a client.
            self._makeCommit(persisted, commitMessage, callback);
        }
    };

    PluginBase.prototype._commitWithClient = function (persisted, commitMessage, callback) {
        var self = this,
            forkName;
        if (self.currentHash !== self.branch.getLocalHash()) {
            // If the client has made local changes  since the plugin started - create a new branch.
            forkName = self.forkName || self.branchName + '_' + (new Date()).getTime();
            self.logger.warn('Client has made local change since the plugin started in "' + self.branchName + '". ' +
                'Trying to create a new branch "' + forkName + '".');
            self.branch = null; // Set the branch to null - from now on the plugin is detached from the client branch.
            self.project.makeCommit(null,
                [self.currentHash],
                persisted.rootHash,
                persisted.objects,
                commitMessage,
                function (err, commitResult) {
                    var originalBranchName;
                    if (err) {
                        self.logger.error('project.makeCommit failed.');
                        callback(err);
                        return;
                    }
                    self.commitHash = commitResult.hash;
                    self.project.setBranchHash(forkName, commitResult.hash, '',
                        function (err, updateResult) {
                            if (err) {
                                self.logger.error('setBranchHash failed with error.');
                                callback(err);
                                return;
                            }
                            self.currentHash = commitResult.hash;
                            if (updateResult.status === STORAGE_CONSTANTS.SYNCH) {
                                self.logger.info('"' + self.branchName + '" was updated to the new commit.' +
                                    '(Successive saves will try to save to this new branch.)');
                                self.branchName = forkName;
                                self.addCommitToResult(STORAGE_CONSTANTS.FORKED);

                                callback(null, {status: STORAGE_CONSTANTS.FORKED, forkName: forkName});

                            } else if (updateResult.status === STORAGE_CONSTANTS.FORKED) {
                                originalBranchName = self.branchName;
                                self.branchName = null;
                                self.addCommitToResult(STORAGE_CONSTANTS.FORKED);
                                callback('Plugin got forked from "' + originalBranchName + '". ' +
                                    'And got forked from name "' + forkName + '" too.');
                            }
                        }
                    );

                }
            );
        } else {
            var commitObject,
                updateData;

            commitObject = self.project.makeCommit(self.branch.name,
                [self.currentHash],
                persisted.rootHash,
                persisted.objects,
                commitMessage,
                function (err, commmitResult) {
                    if (err) {
                        self.logger.error('project.makeCommit failed in _commitWithClient.');
                        callback(err);
                        return;
                    }
                    self.currentHash = commmitResult.hash;

                    if (commmitResult.status === STORAGE_CONSTANTS.SYNCH) {
                        self.logger.info('"' + self.branchName + '" was updated to the new commit.');

                        self.addCommitToResult(STORAGE_CONSTANTS.SYNCH);

                        callback(null, {status: STORAGE_CONSTANTS.SYNCH});
                    } else if (commmitResult.status === STORAGE_CONSTANTS.FORKED) {
                        self.logger.warn('Plugin and client are forked from "' + self.branchName + '". ');
                        // Set the branch to null - from now on the plugin is detached from the client branch.
                        self.branch = null;
                        self._createFork(callback);
                    } else {
                        callback('makeCommit returned unexpected status, ' + commmitResult.status);
                    }
                }
            );

            // Locally update the client with the new data.
            updateData = {
                projectName: self.projectName,
                branchName: self.branchName,
                commitObject: commitObject,
                coreObjects: persisted.objects
            };

            self.branch.localUpdateHandler(self.branch.getUpdateQueue(), updateData, function (aborted) {
                if (aborted) {
                    self.logger.warn('Updates were not loaded in client. Expect a fork..');
                }
            });
        }
    };

    PluginBase.prototype._makeCommit = function (persisted, commitMessage, callback) {
        var self = this;
        self.project.makeCommit(null,
            [self.currentHash],
            persisted.rootHash,
            persisted.objects,
            commitMessage,
            function (err, commitResult) {
                if (err) {
                    self.logger.error('project.makeCommit failed.');
                    callback(err);
                    return;
                }
                self.project.setBranchHash(self.branchName, commitResult.hash, self.currentHash,
                    function (err, updateResult) {
                        if (err) {
                            self.logger.error('setBranchHash failed with error.');
                            callback(err);
                            return;
                        }
                        self.currentHash = commitResult.hash;
                        if (updateResult.status === STORAGE_CONSTANTS.SYNCH) {
                            self.logger.info('"' + self.branchName + '" was updated to the new commit.');

                            self.addCommitToResult(STORAGE_CONSTANTS.SYNCH);

                            callback(null, {status: STORAGE_CONSTANTS.SYNCH});
                        } else if (updateResult.status === STORAGE_CONSTANTS.FORKED) {
                            self._createFork(callback);
                        } else {
                            callback('setBranchHash returned unexpected status' + updateResult.status);
                        }
                    }
                );
            }
        );
    };

    PluginBase.prototype._createFork = function (callback) {
        // User can set self.forkName, but must make sure it is unique.
        var self = this,
            oldBranchName = self.branchName,
            forkName = self.forkName || self.branchName + '_' + (new Date()).getTime();
        self.logger.warn('Plugin got forked from "' + self.branchName + '". ' +
            'Trying to create a new branch "' + forkName + '".');
        self.project.createBranch(forkName, self.currentHash, function (err, forkResult) {
            if (err) {
                self.logger.error('createBranch failed with error.');
                callback(err);
                return;
            }
            if (forkResult.status === STORAGE_CONSTANTS.SYNCH) {
                self.branchName = forkName;
                self.logger.info('"' + self.branchName + '" was updated to the new commit.' +
                    '(Successive saves will try to save to this new branch.)');
                self.addCommitToResult(STORAGE_CONSTANTS.FORKED);

                callback(null, {status: STORAGE_CONSTANTS.FORKED, forkName: forkName});

            } else if (forkResult.status === STORAGE_CONSTANTS.FORKED) {
                self.branchName = null;
                self.addCommitToResult(STORAGE_CONSTANTS.FORKED);

                callback('Plugin got forked from "' + oldBranchName + '". ' +
                    'And got forked from "' + forkName + '" too.');
            } else {
                callback('createBranch returned unexpected status' + forkResult.status);
            }
        });
    };

    PluginBase.prototype.addCommitToResult = function (status) {
        var newCommit = {
            commitHash: this.currentHash,
            branchName: this.branchName,
            status: status
        };
        this.result.addCommit(newCommit);
        this.logger.debug('newCommit added', newCommit);
    };

    //--------------------------------------------------------------------------------------------------------------
    //---------- Methods that are used by the Plugin Manager. Derived classes should not use these methods

    /**
     * Initializes the plugin with objects that can be reused within the same plugin instance.
     *
     * @param {logManager} logger - logging capability to console (or file) based on PluginManager configuration
     * @param {blob.BlobClient} blobClient - virtual file system where files can be generated then saved as a zip file.
     * @param {object} gmeConfig - global configuration for webGME.
     */
    PluginBase.prototype.initialize = function (logger, blobClient, gmeConfig) {
        if (logger) {
            this.logger = logger;
        } else {
            this.logger = console;
        }
        if (!gmeConfig) {
            // TODO: Remove this check at some point
            throw new Error('gmeConfig was not provided to Plugin.initialize!');
        }
        this.blobClient = blobClient;
        this.gmeConfig = gmeConfig;

        this._currentConfig = null;
        // initialize default configuration
        this.setCurrentConfig(this.getDefaultConfig());

        this.isConfigured = false;
    };

    /**
     * Configures this instance of the plugin for a specific execution. This function is called before the main by
     * the PluginManager.
     * Initializes the result with a new object.
     *
     * @param {PluginContext} config - specific context: project, branch, core, active object and active selection.
     */
    PluginBase.prototype.configure = function (config) {
        this.core = config.core;
        this.project = config.project;
        this.branch = config.branch;  // This is only for client side.
        this.projectName = config.projectName;
        this.branchName = config.branchName;
        this.branchHash = config.branchName ? config.commitHash : null;

        this.commitHash = config.commitHash;
        this.currentHash = config.commitHash;

        this.rootNode = config.rootNode;
        this.activeNode = config.activeNode;
        this.activeSelection = config.activeSelection;
        this.META = config.META;

        this.result = new PluginResult();

        this.addCommitToResult(STORAGE_CONSTANTS.SYNCH);

        this.isConfigured = true;
    };

    /**
     * Gets the default configuration based on the configuration structure for this plugin.
     *
     * @returns {plugin.PluginConfig}
     */
    PluginBase.prototype.getDefaultConfig = function () {
        var configStructure = this.getConfigStructure();

        var defaultConfig = new PluginConfig();

        for (var i = 0; i < configStructure.length; i += 1) {
            defaultConfig[configStructure[i].name] = configStructure[i].value;
        }

        return defaultConfig;
    };

    /**
     * Sets the current configuration of the plugin.
     *
     * @param {object} newConfig - this is the actual configuration and NOT the configuration structure.
     */
    PluginBase.prototype.setCurrentConfig = function (newConfig) {
        this._currentConfig = newConfig;
    };

    return PluginBase;
});

/*globals define*/
/*jshint browser: true, node:true*/

/**
 * @author lattmann / https://github.com/lattmann
 */

define('plugin/PluginContext',[], function () {
    

    /**
     * Initializes a new instance of PluginContext. This context is set through PluginBase.configure method for a given
     * plugin instance and execution.
     *
     * @constructor
     */
    var PluginContext = function () {

        // TODO: something like this
//        context.project = project;
//        context.projectName = config.project;
//        context.core = new Core(context.project);
//        context.commitHash = config.commit;
//        context.selected = config.selected;
//        context.storage = null;

    };


    return PluginContext;
});
/*globals define*/
/*jshint browser: true, node:true*/

/**
 * @author lattmann / https://github.com/lattmann
 */

// TODO: Use PluginManagerConfiguration
// TODO: Load ActiveSelection objects and pass it correctly
// TODO: Add more statistics to the result object
// TODO: Result object rename name -> pluginName, time -> finishTime)
// TODO: Make this class testable
// TODO: PluginManager should download the plugins


define('plugin/PluginManagerBase',['plugin/PluginBase', 'plugin/PluginContext'], function (PluginBase, PluginContext) {


        var PluginManagerBase = function (storage, Core, logger, plugins, gmeConfig) {
            this.gmeConfig = gmeConfig; // global configuration of webgme
            this.logger = logger.fork('PluginManager');
            this._Core = Core;       // webgme core class is used to operate on objects
            this._storage = storage; // webgme storage (project)
            this._plugins = plugins; // key value pair of pluginName: pluginType - plugins are already loaded/downloaded
            this._pluginConfigs = {}; // keeps track of the current configuration for each plugins by name

            if (!this.gmeConfig) {
                // TODO: this error check is temporary
                throw new Error('PluginManagerBase takes gmeConfig as parameter!');
            }

            var pluginNames = Object.keys(this._plugins);
            for (var i = 0; i < pluginNames.length; i += 1) {
                var p = new this._plugins[pluginNames[i]]();
                this._pluginConfigs[pluginNames[i]] = p.getDefaultConfig();
            }
        };

        PluginManagerBase.prototype.initialize = function (managerConfiguration, configCallback, callbackContext) {
            var self = this,
                pluginName,
                plugins = this._plugins;

            //#1: PluginManagerBase should load the plugins

            //#2: PluginManagerBase iterates through each plugin and collects the config data
            var pluginConfigs = {};

            for (pluginName in plugins) {
                if (plugins.hasOwnProperty(pluginName)) {
                    var plugin = new plugins[pluginName]();
                    pluginConfigs[pluginName] = plugin.getConfigStructure();
                }
            }

            if (configCallback) {
                configCallback.call(callbackContext, pluginConfigs, function (updatedPluginConfig) {
                    for (pluginName in updatedPluginConfig) {
                        if (updatedPluginConfig.hasOwnProperty(pluginName)) {
                            //save it back to the plugin
                            self._pluginConfigs[pluginName] = updatedPluginConfig[pluginName];
                        }
                    }
                });
            }
        };

        /**
         * Gets a new instance of a plugin by name.
         *
         * @param {string} name
         * @returns {plugin.PluginBase}
         */
        PluginManagerBase.prototype.getPluginByName = function (name) {
            return this._plugins[name];
        };

        PluginManagerBase.prototype.loadMetaNodes = function (pluginContext, callback) {
            var self = this;

            this.logger.debug('Loading meta nodes');

            // get meta members
            var metaIDs = pluginContext.core.getMemberPaths(pluginContext.rootNode, 'MetaAspectSet');

            var len = metaIDs.length;

            var nodeObjs = [];


            var allObjectsLoadedHandler = function () {
                var len2 = nodeObjs.length;

                var nameObjMap = {};

                while (len2--) {
                    var nodeObj = nodeObjs[len2];

                    nameObjMap[pluginContext.core.getAttribute(nodeObj, 'name')] = nodeObj;
                }

                pluginContext.META = nameObjMap;

                self.logger.debug('Meta nodes are loaded');

                callback(null, pluginContext);
            };

            var loadedMetaObjectHandler = function (err, nodeObj) {
                nodeObjs.push(nodeObj);

                if (nodeObjs.length === metaIDs.length) {
                    allObjectsLoadedHandler();
                }
            };

            while (len--) {
                pluginContext.core.loadByPath(pluginContext.rootNode, metaIDs[len], loadedMetaObjectHandler);
            }
        };

        /**
         *
         * @param {plugin.PluginManagerConfiguration} managerConfiguration
         * @param {function} callback
         */
        PluginManagerBase.prototype.getPluginContext = function (managerConfiguration, callback) {
            var self = this,
                pluginContext = new PluginContext();

            // TODO: check if callback is a function
            // based on the string values get the node objects
            // 1) Open project
            // 2) Load branch OR commit hash
            // 3) Load rootNode
            // 4) Load active object
            // 5) Load active selection
            // 6) Update context
            // 7) return

            pluginContext.project = this._storage;
            pluginContext.projectName = managerConfiguration.project;
            pluginContext.branchName = managerConfiguration.branchName;
            pluginContext.branch = pluginContext.project.getBranch(pluginContext.branchName, true);
            pluginContext.core = new self._Core(pluginContext.project, {
                globConf: self.gmeConfig,
                logger: self.logger.fork('core') //TODO: This logger should probably fork from the plugin logger
            });
            pluginContext.commitHash = managerConfiguration.commit;
            pluginContext.activeNode = null;    // active object
            pluginContext.activeSelection = []; // selected objects


            // add activeSelection
            function loadActiveSelectionAndMetaNodes() {
                var remaining = managerConfiguration.activeSelection.length,
                    i;
                function loadNodeByNode(selectedNodePath) {
                    pluginContext.core.loadByPath(pluginContext.rootNode, selectedNodePath,
                        function (err, selectedNode) {
                                remaining -= 1;

                                if (err) {
                                self.logger.warn('unable to load active selection: ' + selectedNodePath);
                                } else {
                                pluginContext.activeSelection.push(selectedNode);
                                }

                                if (remaining === 0) {
                                    // all nodes from active selection are loaded
                                    self.loadMetaNodes(pluginContext, callback);
                                }
                        }
                    );
                }
                if (managerConfiguration.activeSelection.length === 0) {
                    self.loadMetaNodes(pluginContext, callback);
                } else {
                    for (i = 0; i < managerConfiguration.activeSelection.length; i += 1) {
                        loadNodeByNode(managerConfiguration.activeSelection[i]);
                    }
                    }
                }

            // add activeNode
            function loadCommitHashAndRun(commitHash) {
                self.logger.info('Loading commit ' + commitHash);
                pluginContext.project.getCommits(commitHash, 1, function (err, commitObjects) {
                    var commitObj;
                    if (err || commitObjects.length !== 1) {
                        if (err) {
                            callback(err, pluginContext);
                        } else {
                            self.logger.error('commitObjects', commitObjects);
                            callback('getCommits did not return with one commit', pluginContext);
                        }
                        return;
                    }

                    commitObj = commitObjects[0];

                    if (typeof commitObj === 'undefined' || commitObj === null) {
                        callback('cannot find commit', pluginContext);
                        return;
                    }

                    if (managerConfiguration.rootHash && commitObj.root !== managerConfiguration.rootHash) {
                        // This is a sanity check for the client state handling..
                        self.logger.error('Root hash for commit-object, is not the same as passed from the client.' +
                        'commitHash, rootHash, given rootHash:',
                            commitHash, commitObj.root, managerConfiguration.rootHash);
                    }

                    pluginContext.core.loadRoot(commitObj.root, function (err, rootNode) {
                        if (err) {
                            callback('unable to load root', pluginContext);
                            return;
                        }

                        pluginContext.rootNode = rootNode;
                        if (typeof managerConfiguration.activeNode === 'string') {
                            pluginContext.core.loadByPath(pluginContext.rootNode, managerConfiguration.activeNode,
                                function (err, activeNode) {
                                if (err) {
                                        callback('unable to load selected object', pluginContext);
                                    return;
                                }

                                pluginContext.activeNode = activeNode;
                                loadActiveSelectionAndMetaNodes();
                                }
                            );
                        } else {
                            pluginContext.activeNode = null;
                            loadActiveSelectionAndMetaNodes();
                        }
                    });
                });
            }

            // load commit hash and run based on branch name or commit hash
            if (managerConfiguration.branchName) {
                pluginContext.project.getBranchNames(function (err, branchNames) {
                    self.logger.debug(branchNames);

                        pluginContext.commitHash = branchNames[managerConfiguration.branchName] || pluginContext.commitHash;
                        pluginContext.branchName = managerConfiguration.branchName;
                        loadCommitHashAndRun(pluginContext.commitHash);
                });
            } else {
                loadCommitHashAndRun(pluginContext.commitHash);
            }

        };

        PluginManagerBase.prototype.executePlugin = function (name, managerConfiguration, callback) {
            // TODO: check if name is a string
            // TODO: check if managerConfiguration is an instance of PluginManagerConfiguration
            // TODO: check if callback is a function
            var self = this,
                mainCallbackCalls = 0,
                multiCallbackHandled = false;

            var PluginClass = this.getPluginByName(name);

            var plugin = new PluginClass();

            var pluginLogger = this.logger.fork('gme:plugin:' + name, true);

            plugin.initialize(pluginLogger, managerConfiguration.blobClient, self.gmeConfig);

            plugin.setCurrentConfig(this._pluginConfigs[name]);
            for (var key in managerConfiguration.pluginConfig) {
                if (managerConfiguration.pluginConfig.hasOwnProperty(key) &&
                    plugin._currentConfig.hasOwnProperty(key)) {

                    plugin._currentConfig[key] = managerConfiguration.pluginConfig[key];
                }
            }
            self.getPluginContext(managerConfiguration, function (err, pluginContext) {
                if (err) {
                    // TODO: this has to return with an empty PluginResult object and NOT with null.
                    callback(err, null);
                    return;

                }

                plugin.configure(pluginContext);

                var startTime = (new Date()).toISOString();

                plugin.main(function (err, result) {
                    var stackTrace;
                    mainCallbackCalls += 1;
                    // set common information (meta info) about the plugin and measured execution times
                    result.setFinishTime((new Date()).toISOString());
                    result.setStartTime(startTime);

                    result.setPluginName(plugin.getName());

                    if (mainCallbackCalls > 1) {
                        stackTrace = new Error().stack;
                        self.logger.error('The main callback is being called more than once!', {metadata: stackTrace});
                        result.setError('The main callback is being called more than once!');
                        if (multiCallbackHandled === true) {
                            plugin.createMessage(null, stackTrace);
                            return;
                        }
                        multiCallbackHandled = true;
                        result.setSuccess(false);
                        plugin.createMessage(null, 'The main callback is being called more than once.');
                        plugin.createMessage(null, stackTrace);
                        callback('The main callback is being called more than once!', result);
                    } else {
                        result.setError(err);
                        callback(err, result);
                    }
                });

            });

        };


        return PluginManagerBase;
    });
define('js/Dialogs/PluginConfig/PluginConfigDialog',[], function () {
   return;
});

/*globals define, WebGMEGlobal, requirejs*/
/*jshint browser: true*/

/**
 * @author rkereskenyi / https://github.com/rkereskenyi
 * @author lattmann / https://github.com/lattmann
 * @author pmeijer / https://github.com/pmeijer
 */

define('js/Utils/InterpreterManager',[
    'common/core/core',
    'plugin/PluginManagerBase',
    'plugin/PluginResult',
    'blob/BlobClient',
    'js/Dialogs/PluginConfig/PluginConfigDialog',
    'js/logger'
], function (Core, PluginManagerBase, PluginResult, BlobClient, PluginConfigDialog, Logger) {

    

    var InterpreterManager = function (client, gmeConfig) {
        this._client = client;
        //this._manager = new PluginManagerBase();
        this.gmeConfig = gmeConfig;
        this._savedConfigs = {};
        this.logger = Logger.create('gme:InterpreterManager', gmeConfig.client.log);
        this.logger.debug('InterpreterManager ctor');
    };

    var getPlugin = function (name, callback) {
        if (WebGMEGlobal && WebGMEGlobal.plugins && WebGMEGlobal.plugins.hasOwnProperty(name)) {
            callback(null, WebGMEGlobal.plugins[name]);
        } else {
            requirejs(['/plugin/' + name + '/' + name + '/' + name],
                function (InterpreterClass) {
                    callback(null, InterpreterClass);
                },
                function (err) {
                    callback(err, null);
                }
            );
        }
    };

    /**
     *
     * @param {string} name - name of plugin to be executed.
     * @param {object} silentPluginCfg - if falsy dialog window will be shown.
     * @param {object.string} silentPluginCfg.activeNode - Path to activeNode.
     * @param {object.Array.<string>} silentPluginCfg.activeSelection - Paths to nodes in activeSelection.
     * @param {object.boolean} silentPluginCfg.runOnServer - Whether to run the plugin on the server or not.
     * @param {object.object} silentPluginCfg.pluginConfig - Plugin specific options.
     * @param callback
     */
    InterpreterManager.prototype.run = function (name, silentPluginCfg, callback) {
        var self = this;
        getPlugin(name, function (err, plugin) {
            self.logger.debug('Getting getPlugin in run.');
            if (!err && plugin) {
                var plugins = {},
                    runWithConfiguration;
                plugins[name] = plugin;
                var pluginManager = new PluginManagerBase(self._client.getProjectObject(), Core, self.logger, plugins,
                    self.gmeConfig);
                pluginManager.initialize(null, function (pluginConfigs, configSaveCallback) {
                    //#1: display config to user
                    var noServerExecution = self.gmeConfig.plugin.allowServerExecution === false,
                        hackedConfig = {
                            'Global Options': [
                                {
                                    name: 'runOnServer',
                                    displayName: 'Execute on Server',
                                    description: noServerExecution ? 'Server side execution is disabled.' : '',
                                    value: false, // this is the 'default config'
                                    valueType: 'boolean',
                                    readOnly: noServerExecution
                                }
                            ]
                        },
                        i, j, d, len;

                    for (i in pluginConfigs) {
                        if (pluginConfigs.hasOwnProperty(i)) {
                            hackedConfig[i] = pluginConfigs[i];

                            // retrieve user settings from previous run
                            if (self._savedConfigs.hasOwnProperty(i)) {
                                var iConfig = self._savedConfigs[i];
                                len = hackedConfig[i].length;

                                while (len--) {
                                    if (iConfig.hasOwnProperty(hackedConfig[i][len].name)) {
                                        hackedConfig[i][len].value = iConfig[hackedConfig[i][len].name];
                                    }
                                }

                            }
                        }
                    }

                    runWithConfiguration = function (updatedConfig) {
                        //when Save&Run is clicked in the dialog (or silentPluginCfg was passed)
                        var globalconfig = updatedConfig['Global Options'],
                            activeNode,
                            activeSelection;
                        delete updatedConfig['Global Options'];

                        activeNode = silentPluginCfg.activeNode;
                        if (!activeNode && WebGMEGlobal && WebGMEGlobal.State) {
                            activeNode = WebGMEGlobal.State.getActiveObject();
                        }
                        activeSelection = silentPluginCfg.activeSelection;
                        if (!activeSelection && WebGMEGlobal && WebGMEGlobal.State) {
                            activeSelection = WebGMEGlobal.State.getActiveSelection();
                        }
                        // save config from user
                        for (i in updatedConfig) {
                            self._savedConfigs[i] = updatedConfig[i];
                        }

                        //#2: save it back and run the plugin
                        if (configSaveCallback) {
                            configSaveCallback(updatedConfig);

                            // TODO: If global config says try to merge branch then we
                            // TODO: should pass the name of the branch.
                            var config = {
                                project: self._client.getActiveProjectName(),
                                token: '',
                                activeNode: activeNode, // active object in the editor
                                activeSelection: activeSelection || [],
                                commit: self._client.getActiveCommitHash(), //#668b3babcdf2ddcd7ba38b51acb62d63da859d90,
                                // This will get loaded too which will provide a sanity check on the client state.
                                rootHash: self._client.getActiveRootHash(),
                                branchName: self._client.getActiveBranchName()
                            };

                            if (globalconfig.runOnServer === true || silentPluginCfg.runOnServer === true) {
                                var context = {
                                    managerConfig: config,
                                    pluginConfig: updatedConfig[name]
                                };
                                self._client.runServerPlugin(name, context, function (err, result) {
                                    if (err) {
                                        self.logger.error(err);
                                        callback(new PluginResult()); //TODO return proper error result
                                    } else {
                                        var resultObject = new PluginResult(result);
                                        callback(resultObject);
                                    }
                                });
                            } else {
                                config.blobClient = new BlobClient();

                                pluginManager.executePlugin(name, config, function (err, result) {
                                    if (err) {
                                        self.logger.error(err);
                                    }
                                    callback(result);
                                });
                            }
                        }
                    };

                    if (silentPluginCfg) {
                        var updatedConfig = {};
                        for (i in hackedConfig) {
                            updatedConfig[i] = {};
                            len = hackedConfig[i].length;
                            while (len--) {
                                updatedConfig[i][hackedConfig[i][len].name] = hackedConfig[i][len].value;
                            }

                            if (silentPluginCfg && silentPluginCfg.pluginConfig) {
                                for (j in silentPluginCfg.pluginConfig) {
                                    updatedConfig[i][j] = silentPluginCfg.pluginConfig[j];
                                }
                            }
                        }
                        runWithConfiguration(updatedConfig);
                    } else {
                        d = new PluginConfigDialog();
                        silentPluginCfg = {};
                        d.show(hackedConfig, runWithConfiguration);
                    }
                });
            } else {
                self.logger.error(err);
                self.logger.error('unable to load plugin');
                callback(null); //TODO proper result
            }
        });
    };

    //TODO: Somehow it would feel more right if we do run in async mode, but if not then we should provide getState and
    //TODO: getResult synchronous functions as well.

    return InterpreterManager;
});

!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define('lib/superagent/superagent-1.2.0',[],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.superagent=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * Module dependencies.
 */

var Emitter = require('emitter');
var reduce = require('reduce');

/**
 * Root reference for iframes.
 */

var root = 'undefined' == typeof window
  ? (this || self)
  : window;

/**
 * Noop.
 */

function noop(){};

/**
 * Check if `obj` is a host object,
 * we don't want to serialize these :)
 *
 * TODO: future proof, move to compoent land
 *
 * @param {Object} obj
 * @return {Boolean}
 * @api private
 */

function isHost(obj) {
  var str = {}.toString.call(obj);

  switch (str) {
    case '[object File]':
    case '[object Blob]':
    case '[object FormData]':
      return true;
    default:
      return false;
  }
}

/**
 * Determine XHR.
 */

request.getXHR = function () {
  if (root.XMLHttpRequest
      && (!root.location || 'file:' != root.location.protocol
          || !root.ActiveXObject)) {
    return new XMLHttpRequest;
  } else {
    try { return new ActiveXObject('Microsoft.XMLHTTP'); } catch(e) {}
    try { return new ActiveXObject('Msxml2.XMLHTTP.6.0'); } catch(e) {}
    try { return new ActiveXObject('Msxml2.XMLHTTP.3.0'); } catch(e) {}
    try { return new ActiveXObject('Msxml2.XMLHTTP'); } catch(e) {}
  }
  return false;
};

/**
 * Removes leading and trailing whitespace, added to support IE.
 *
 * @param {String} s
 * @return {String}
 * @api private
 */

var trim = ''.trim
  ? function(s) { return s.trim(); }
  : function(s) { return s.replace(/(^\s*|\s*$)/g, ''); };

/**
 * Check if `obj` is an object.
 *
 * @param {Object} obj
 * @return {Boolean}
 * @api private
 */

function isObject(obj) {
  return obj === Object(obj);
}

/**
 * Serialize the given `obj`.
 *
 * @param {Object} obj
 * @return {String}
 * @api private
 */

function serialize(obj) {
  if (!isObject(obj)) return obj;
  var pairs = [];
  for (var key in obj) {
    if (null != obj[key]) {
      pairs.push(encodeURIComponent(key)
        + '=' + encodeURIComponent(obj[key]));
    }
  }
  return pairs.join('&');
}

/**
 * Expose serialization method.
 */

 request.serializeObject = serialize;

 /**
  * Parse the given x-www-form-urlencoded `str`.
  *
  * @param {String} str
  * @return {Object}
  * @api private
  */

function parseString(str) {
  var obj = {};
  var pairs = str.split('&');
  var parts;
  var pair;

  for (var i = 0, len = pairs.length; i < len; ++i) {
    pair = pairs[i];
    parts = pair.split('=');
    obj[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1]);
  }

  return obj;
}

/**
 * Expose parser.
 */

request.parseString = parseString;

/**
 * Default MIME type map.
 *
 *     superagent.types.xml = 'application/xml';
 *
 */

request.types = {
  html: 'text/html',
  json: 'application/json',
  xml: 'application/xml',
  urlencoded: 'application/x-www-form-urlencoded',
  'form': 'application/x-www-form-urlencoded',
  'form-data': 'application/x-www-form-urlencoded'
};

/**
 * Default serialization map.
 *
 *     superagent.serialize['application/xml'] = function(obj){
 *       return 'generated xml here';
 *     };
 *
 */

 request.serialize = {
   'application/x-www-form-urlencoded': serialize,
   'application/json': JSON.stringify
 };

 /**
  * Default parsers.
  *
  *     superagent.parse['application/xml'] = function(str){
  *       return { object parsed from str };
  *     };
  *
  */

request.parse = {
  'application/x-www-form-urlencoded': parseString,
  'application/json': JSON.parse
};

/**
 * Parse the given header `str` into
 * an object containing the mapped fields.
 *
 * @param {String} str
 * @return {Object}
 * @api private
 */

function parseHeader(str) {
  var lines = str.split(/\r?\n/);
  var fields = {};
  var index;
  var line;
  var field;
  var val;

  lines.pop(); // trailing CRLF

  for (var i = 0, len = lines.length; i < len; ++i) {
    line = lines[i];
    index = line.indexOf(':');
    field = line.slice(0, index).toLowerCase();
    val = trim(line.slice(index + 1));
    fields[field] = val;
  }

  return fields;
}

/**
 * Return the mime type for the given `str`.
 *
 * @param {String} str
 * @return {String}
 * @api private
 */

function type(str){
  return str.split(/ *; */).shift();
};

/**
 * Return header field parameters.
 *
 * @param {String} str
 * @return {Object}
 * @api private
 */

function params(str){
  return reduce(str.split(/ *; */), function(obj, str){
    var parts = str.split(/ *= */)
      , key = parts.shift()
      , val = parts.shift();

    if (key && val) obj[key] = val;
    return obj;
  }, {});
};

/**
 * Initialize a new `Response` with the given `xhr`.
 *
 *  - set flags (.ok, .error, etc)
 *  - parse header
 *
 * Examples:
 *
 *  Aliasing `superagent` as `request` is nice:
 *
 *      request = superagent;
 *
 *  We can use the promise-like API, or pass callbacks:
 *
 *      request.get('/').end(function(res){});
 *      request.get('/', function(res){});
 *
 *  Sending data can be chained:
 *
 *      request
 *        .post('/user')
 *        .send({ name: 'tj' })
 *        .end(function(res){});
 *
 *  Or passed to `.send()`:
 *
 *      request
 *        .post('/user')
 *        .send({ name: 'tj' }, function(res){});
 *
 *  Or passed to `.post()`:
 *
 *      request
 *        .post('/user', { name: 'tj' })
 *        .end(function(res){});
 *
 * Or further reduced to a single call for simple cases:
 *
 *      request
 *        .post('/user', { name: 'tj' }, function(res){});
 *
 * @param {XMLHTTPRequest} xhr
 * @param {Object} options
 * @api private
 */

function Response(req, options) {
  options = options || {};
  this.req = req;
  this.xhr = this.req.xhr;
  // responseText is accessible only if responseType is '' or 'text' and on older browsers
  this.text = ((this.req.method !='HEAD' && (this.xhr.responseType === '' || this.xhr.responseType === 'text')) || typeof this.xhr.responseType === 'undefined')
     ? this.xhr.responseText
     : null;
  this.statusText = this.req.xhr.statusText;
  this.setStatusProperties(this.xhr.status);
  this.header = this.headers = parseHeader(this.xhr.getAllResponseHeaders());
  // getAllResponseHeaders sometimes falsely returns "" for CORS requests, but
  // getResponseHeader still works. so we get content-type even if getting
  // other headers fails.
  this.header['content-type'] = this.xhr.getResponseHeader('content-type');
  this.setHeaderProperties(this.header);
  this.body = this.req.method != 'HEAD'
    ? this.parseBody(this.text ? this.text : this.xhr.response)
    : null;
}

/**
 * Get case-insensitive `field` value.
 *
 * @param {String} field
 * @return {String}
 * @api public
 */

Response.prototype.get = function(field){
  return this.header[field.toLowerCase()];
};

/**
 * Set header related properties:
 *
 *   - `.type` the content type without params
 *
 * A response of "Content-Type: text/plain; charset=utf-8"
 * will provide you with a `.type` of "text/plain".
 *
 * @param {Object} header
 * @api private
 */

Response.prototype.setHeaderProperties = function(header){
  // content-type
  var ct = this.header['content-type'] || '';
  this.type = type(ct);

  // params
  var obj = params(ct);
  for (var key in obj) this[key] = obj[key];
};

/**
 * Parse the given body `str`.
 *
 * Used for auto-parsing of bodies. Parsers
 * are defined on the `superagent.parse` object.
 *
 * @param {String} str
 * @return {Mixed}
 * @api private
 */

Response.prototype.parseBody = function(str){
  var parse = request.parse[this.type];
  return parse && str && (str.length || str instanceof Object)
    ? parse(str)
    : null;
};

/**
 * Set flags such as `.ok` based on `status`.
 *
 * For example a 2xx response will give you a `.ok` of __true__
 * whereas 5xx will be __false__ and `.error` will be __true__. The
 * `.clientError` and `.serverError` are also available to be more
 * specific, and `.statusType` is the class of error ranging from 1..5
 * sometimes useful for mapping respond colors etc.
 *
 * "sugar" properties are also defined for common cases. Currently providing:
 *
 *   - .noContent
 *   - .badRequest
 *   - .unauthorized
 *   - .notAcceptable
 *   - .notFound
 *
 * @param {Number} status
 * @api private
 */

Response.prototype.setStatusProperties = function(status){
  // handle IE9 bug: http://stackoverflow.com/questions/10046972/msie-returns-status-code-of-1223-for-ajax-request
  if (status === 1223) {
    status = 204;
  }

  var type = status / 100 | 0;

  // status / class
  this.status = status;
  this.statusType = type;

  // basics
  this.info = 1 == type;
  this.ok = 2 == type;
  this.clientError = 4 == type;
  this.serverError = 5 == type;
  this.error = (4 == type || 5 == type)
    ? this.toError()
    : false;

  // sugar
  this.accepted = 202 == status;
  this.noContent = 204 == status;
  this.badRequest = 400 == status;
  this.unauthorized = 401 == status;
  this.notAcceptable = 406 == status;
  this.notFound = 404 == status;
  this.forbidden = 403 == status;
};

/**
 * Return an `Error` representative of this response.
 *
 * @return {Error}
 * @api public
 */

Response.prototype.toError = function(){
  var req = this.req;
  var method = req.method;
  var url = req.url;

  var msg = 'cannot ' + method + ' ' + url + ' (' + this.status + ')';
  var err = new Error(msg);
  err.status = this.status;
  err.method = method;
  err.url = url;

  return err;
};

/**
 * Expose `Response`.
 */

request.Response = Response;

/**
 * Initialize a new `Request` with the given `method` and `url`.
 *
 * @param {String} method
 * @param {String} url
 * @api public
 */

function Request(method, url) {
  var self = this;
  Emitter.call(this);
  this._query = this._query || [];
  this.method = method;
  this.url = url;
  this.header = {};
  this._header = {};
  this.on('end', function(){
    var err = null;
    var res = null;

    try {
      res = new Response(self);
    } catch(e) {
      err = new Error('Parser is unable to parse the response');
      err.parse = true;
      err.original = e;
      return self.callback(err);
    }

    self.emit('response', res);

    if (err) {
      return self.callback(err, res);
    }

    if (res.status >= 200 && res.status < 300) {
      return self.callback(err, res);
    }

    var new_err = new Error(res.statusText || 'Unsuccessful HTTP response');
    new_err.original = err;
    new_err.response = res;
    new_err.status = res.status;

    self.callback(err || new_err, res);
  });
}

/**
 * Mixin `Emitter`.
 */

Emitter(Request.prototype);

/**
 * Allow for extension
 */

Request.prototype.use = function(fn) {
  fn(this);
  return this;
}

/**
 * Set timeout to `ms`.
 *
 * @param {Number} ms
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.timeout = function(ms){
  this._timeout = ms;
  return this;
};

/**
 * Clear previous timeout.
 *
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.clearTimeout = function(){
  this._timeout = 0;
  clearTimeout(this._timer);
  return this;
};

/**
 * Abort the request, and clear potential timeout.
 *
 * @return {Request}
 * @api public
 */

Request.prototype.abort = function(){
  if (this.aborted) return;
  this.aborted = true;
  this.xhr.abort();
  this.clearTimeout();
  this.emit('abort');
  return this;
};

/**
 * Set header `field` to `val`, or multiple fields with one object.
 *
 * Examples:
 *
 *      req.get('/')
 *        .set('Accept', 'application/json')
 *        .set('X-API-Key', 'foobar')
 *        .end(callback);
 *
 *      req.get('/')
 *        .set({ Accept: 'application/json', 'X-API-Key': 'foobar' })
 *        .end(callback);
 *
 * @param {String|Object} field
 * @param {String} val
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.set = function(field, val){
  if (isObject(field)) {
    for (var key in field) {
      this.set(key, field[key]);
    }
    return this;
  }
  this._header[field.toLowerCase()] = val;
  this.header[field] = val;
  return this;
};

/**
 * Remove header `field`.
 *
 * Example:
 *
 *      req.get('/')
 *        .unset('User-Agent')
 *        .end(callback);
 *
 * @param {String} field
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.unset = function(field){
  delete this._header[field.toLowerCase()];
  delete this.header[field];
  return this;
};

/**
 * Get case-insensitive header `field` value.
 *
 * @param {String} field
 * @return {String}
 * @api private
 */

Request.prototype.getHeader = function(field){
  return this._header[field.toLowerCase()];
};

/**
 * Set Content-Type to `type`, mapping values from `request.types`.
 *
 * Examples:
 *
 *      superagent.types.xml = 'application/xml';
 *
 *      request.post('/')
 *        .type('xml')
 *        .send(xmlstring)
 *        .end(callback);
 *
 *      request.post('/')
 *        .type('application/xml')
 *        .send(xmlstring)
 *        .end(callback);
 *
 * @param {String} type
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.type = function(type){
  this.set('Content-Type', request.types[type] || type);
  return this;
};

/**
 * Set Accept to `type`, mapping values from `request.types`.
 *
 * Examples:
 *
 *      superagent.types.json = 'application/json';
 *
 *      request.get('/agent')
 *        .accept('json')
 *        .end(callback);
 *
 *      request.get('/agent')
 *        .accept('application/json')
 *        .end(callback);
 *
 * @param {String} accept
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.accept = function(type){
  this.set('Accept', request.types[type] || type);
  return this;
};

/**
 * Set Authorization field value with `user` and `pass`.
 *
 * @param {String} user
 * @param {String} pass
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.auth = function(user, pass){
  var str = btoa(user + ':' + pass);
  this.set('Authorization', 'Basic ' + str);
  return this;
};

/**
* Add query-string `val`.
*
* Examples:
*
*   request.get('/shoes')
*     .query('size=10')
*     .query({ color: 'blue' })
*
* @param {Object|String} val
* @return {Request} for chaining
* @api public
*/

Request.prototype.query = function(val){
  if ('string' != typeof val) val = serialize(val);
  if (val) this._query.push(val);
  return this;
};

/**
 * Write the field `name` and `val` for "multipart/form-data"
 * request bodies.
 *
 * ``` js
 * request.post('/upload')
 *   .field('foo', 'bar')
 *   .end(callback);
 * ```
 *
 * @param {String} name
 * @param {String|Blob|File} val
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.field = function(name, val){
  if (!this._formData) this._formData = new root.FormData();
  this._formData.append(name, val);
  return this;
};

/**
 * Queue the given `file` as an attachment to the specified `field`,
 * with optional `filename`.
 *
 * ``` js
 * request.post('/upload')
 *   .attach(new Blob(['<a id="a"><b id="b">hey!</b></a>'], { type: "text/html"}))
 *   .end(callback);
 * ```
 *
 * @param {String} field
 * @param {Blob|File} file
 * @param {String} filename
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.attach = function(field, file, filename){
  if (!this._formData) this._formData = new root.FormData();
  this._formData.append(field, file, filename);
  return this;
};

/**
 * Send `data`, defaulting the `.type()` to "json" when
 * an object is given.
 *
 * Examples:
 *
 *       // querystring
 *       request.get('/search')
 *         .end(callback)
 *
 *       // multiple data "writes"
 *       request.get('/search')
 *         .send({ search: 'query' })
 *         .send({ range: '1..5' })
 *         .send({ order: 'desc' })
 *         .end(callback)
 *
 *       // manual json
 *       request.post('/user')
 *         .type('json')
 *         .send('{"name":"tj"})
 *         .end(callback)
 *
 *       // auto json
 *       request.post('/user')
 *         .send({ name: 'tj' })
 *         .end(callback)
 *
 *       // manual x-www-form-urlencoded
 *       request.post('/user')
 *         .type('form')
 *         .send('name=tj')
 *         .end(callback)
 *
 *       // auto x-www-form-urlencoded
 *       request.post('/user')
 *         .type('form')
 *         .send({ name: 'tj' })
 *         .end(callback)
 *
 *       // defaults to x-www-form-urlencoded
  *      request.post('/user')
  *        .send('name=tobi')
  *        .send('species=ferret')
  *        .end(callback)
 *
 * @param {String|Object} data
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.send = function(data){
  var obj = isObject(data);
  var type = this.getHeader('Content-Type');

  // merge
  if (obj && isObject(this._data)) {
    for (var key in data) {
      this._data[key] = data[key];
    }
  } else if ('string' == typeof data) {
    if (!type) this.type('form');
    type = this.getHeader('Content-Type');
    if ('application/x-www-form-urlencoded' == type) {
      this._data = this._data
        ? this._data + '&' + data
        : data;
    } else {
      this._data = (this._data || '') + data;
    }
  } else {
    this._data = data;
  }

  if (!obj || isHost(data)) return this;
  if (!type) this.type('json');
  return this;
};

/**
 * Invoke the callback with `err` and `res`
 * and handle arity check.
 *
 * @param {Error} err
 * @param {Response} res
 * @api private
 */

Request.prototype.callback = function(err, res){
  var fn = this._callback;
  this.clearTimeout();
  fn(err, res);
};

/**
 * Invoke callback with x-domain error.
 *
 * @api private
 */

Request.prototype.crossDomainError = function(){
  var err = new Error('Origin is not allowed by Access-Control-Allow-Origin');
  err.crossDomain = true;
  this.callback(err);
};

/**
 * Invoke callback with timeout error.
 *
 * @api private
 */

Request.prototype.timeoutError = function(){
  var timeout = this._timeout;
  var err = new Error('timeout of ' + timeout + 'ms exceeded');
  err.timeout = timeout;
  this.callback(err);
};

/**
 * Enable transmission of cookies with x-domain requests.
 *
 * Note that for this to work the origin must not be
 * using "Access-Control-Allow-Origin" with a wildcard,
 * and also must set "Access-Control-Allow-Credentials"
 * to "true".
 *
 * @api public
 */

Request.prototype.withCredentials = function(){
  this._withCredentials = true;
  return this;
};

/**
 * Initiate request, invoking callback `fn(res)`
 * with an instanceof `Response`.
 *
 * @param {Function} fn
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.end = function(fn){
  var self = this;
  var xhr = this.xhr = request.getXHR();
  var query = this._query.join('&');
  var timeout = this._timeout;
  var data = this._formData || this._data;

  // store callback
  this._callback = fn || noop;

  // state change
  xhr.onreadystatechange = function(){
    if (4 != xhr.readyState) return;

    // In IE9, reads to any property (e.g. status) off of an aborted XHR will
    // result in the error "Could not complete the operation due to error c00c023f"
    var status;
    try { status = xhr.status } catch(e) { status = 0; }

    if (0 == status) {
      if (self.timedout) return self.timeoutError();
      if (self.aborted) return;
      return self.crossDomainError();
    }
    self.emit('end');
  };

  // progress
  var handleProgress = function(e){
    if (e.total > 0) {
      e.percent = e.loaded / e.total * 100;
    }
    self.emit('progress', e);
  };
  if (this.hasListeners('progress')) {
    xhr.onprogress = handleProgress;
  }
  try {
    if (xhr.upload && this.hasListeners('progress')) {
      xhr.upload.onprogress = handleProgress;
    }
  } catch(e) {
    // Accessing xhr.upload fails in IE from a web worker, so just pretend it doesn't exist.
    // Reported here:
    // https://connect.microsoft.com/IE/feedback/details/837245/xmlhttprequest-upload-throws-invalid-argument-when-used-from-web-worker-context
  }

  // timeout
  if (timeout && !this._timer) {
    this._timer = setTimeout(function(){
      self.timedout = true;
      self.abort();
    }, timeout);
  }

  // querystring
  if (query) {
    query = request.serializeObject(query);
    this.url += ~this.url.indexOf('?')
      ? '&' + query
      : '?' + query;
  }

  // initiate request
  xhr.open(this.method, this.url, true);

  // CORS
  if (this._withCredentials) xhr.withCredentials = true;

  // body
  if ('GET' != this.method && 'HEAD' != this.method && 'string' != typeof data && !isHost(data)) {
    // serialize stuff
    var serialize = request.serialize[this.getHeader('Content-Type')];
    if (serialize) data = serialize(data);
  }

  // set header fields
  for (var field in this.header) {
    if (null == this.header[field]) continue;
    xhr.setRequestHeader(field, this.header[field]);
  }

  // send stuff
  this.emit('request', this);
  xhr.send(data);
  return this;
};

/**
 * Expose `Request`.
 */

request.Request = Request;

/**
 * Issue a request:
 *
 * Examples:
 *
 *    request('GET', '/users').end(callback)
 *    request('/users').end(callback)
 *    request('/users', callback)
 *
 * @param {String} method
 * @param {String|Function} url or callback
 * @return {Request}
 * @api public
 */

function request(method, url) {
  // callback
  if ('function' == typeof url) {
    return new Request('GET', method).end(url);
  }

  // url first
  if (1 == arguments.length) {
    return new Request('GET', method);
  }

  return new Request(method, url);
}

/**
 * GET `url` with optional callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed|Function} data or fn
 * @param {Function} fn
 * @return {Request}
 * @api public
 */

request.get = function(url, data, fn){
  var req = request('GET', url);
  if ('function' == typeof data) fn = data, data = null;
  if (data) req.query(data);
  if (fn) req.end(fn);
  return req;
};

/**
 * HEAD `url` with optional callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed|Function} data or fn
 * @param {Function} fn
 * @return {Request}
 * @api public
 */

request.head = function(url, data, fn){
  var req = request('HEAD', url);
  if ('function' == typeof data) fn = data, data = null;
  if (data) req.send(data);
  if (fn) req.end(fn);
  return req;
};

/**
 * DELETE `url` with optional callback `fn(res)`.
 *
 * @param {String} url
 * @param {Function} fn
 * @return {Request}
 * @api public
 */

request.del = function(url, fn){
  var req = request('DELETE', url);
  if (fn) req.end(fn);
  return req;
};

/**
 * PATCH `url` with optional `data` and callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed} data
 * @param {Function} fn
 * @return {Request}
 * @api public
 */

request.patch = function(url, data, fn){
  var req = request('PATCH', url);
  if ('function' == typeof data) fn = data, data = null;
  if (data) req.send(data);
  if (fn) req.end(fn);
  return req;
};

/**
 * POST `url` with optional `data` and callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed} data
 * @param {Function} fn
 * @return {Request}
 * @api public
 */

request.post = function(url, data, fn){
  var req = request('POST', url);
  if ('function' == typeof data) fn = data, data = null;
  if (data) req.send(data);
  if (fn) req.end(fn);
  return req;
};

/**
 * PUT `url` with optional `data` and callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed|Function} data or fn
 * @param {Function} fn
 * @return {Request}
 * @api public
 */

request.put = function(url, data, fn){
  var req = request('PUT', url);
  if ('function' == typeof data) fn = data, data = null;
  if (data) req.send(data);
  if (fn) req.end(fn);
  return req;
};

/**
 * Expose `request`.
 */

module.exports = request;

},{"emitter":2,"reduce":3}],2:[function(require,module,exports){

/**
 * Expose `Emitter`.
 */

module.exports = Emitter;

/**
 * Initialize a new `Emitter`.
 *
 * @api public
 */

function Emitter(obj) {
  if (obj) return mixin(obj);
};

/**
 * Mixin the emitter properties.
 *
 * @param {Object} obj
 * @return {Object}
 * @api private
 */

function mixin(obj) {
  for (var key in Emitter.prototype) {
    obj[key] = Emitter.prototype[key];
  }
  return obj;
}

/**
 * Listen on the given `event` with `fn`.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.on =
Emitter.prototype.addEventListener = function(event, fn){
  this._callbacks = this._callbacks || {};
  (this._callbacks[event] = this._callbacks[event] || [])
    .push(fn);
  return this;
};

/**
 * Adds an `event` listener that will be invoked a single
 * time then automatically removed.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.once = function(event, fn){
  var self = this;
  this._callbacks = this._callbacks || {};

  function on() {
    self.off(event, on);
    fn.apply(this, arguments);
  }

  on.fn = fn;
  this.on(event, on);
  return this;
};

/**
 * Remove the given callback for `event` or all
 * registered callbacks.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.off =
Emitter.prototype.removeListener =
Emitter.prototype.removeAllListeners =
Emitter.prototype.removeEventListener = function(event, fn){
  this._callbacks = this._callbacks || {};

  // all
  if (0 == arguments.length) {
    this._callbacks = {};
    return this;
  }

  // specific event
  var callbacks = this._callbacks[event];
  if (!callbacks) return this;

  // remove all handlers
  if (1 == arguments.length) {
    delete this._callbacks[event];
    return this;
  }

  // remove specific handler
  var cb;
  for (var i = 0; i < callbacks.length; i++) {
    cb = callbacks[i];
    if (cb === fn || cb.fn === fn) {
      callbacks.splice(i, 1);
      break;
    }
  }
  return this;
};

/**
 * Emit `event` with the given args.
 *
 * @param {String} event
 * @param {Mixed} ...
 * @return {Emitter}
 */

Emitter.prototype.emit = function(event){
  this._callbacks = this._callbacks || {};
  var args = [].slice.call(arguments, 1)
    , callbacks = this._callbacks[event];

  if (callbacks) {
    callbacks = callbacks.slice(0);
    for (var i = 0, len = callbacks.length; i < len; ++i) {
      callbacks[i].apply(this, args);
    }
  }

  return this;
};

/**
 * Return array of callbacks for `event`.
 *
 * @param {String} event
 * @return {Array}
 * @api public
 */

Emitter.prototype.listeners = function(event){
  this._callbacks = this._callbacks || {};
  return this._callbacks[event] || [];
};

/**
 * Check if this emitter has `event` handlers.
 *
 * @param {String} event
 * @return {Boolean}
 * @api public
 */

Emitter.prototype.hasListeners = function(event){
  return !! this.listeners(event).length;
};

},{}],3:[function(require,module,exports){

/**
 * Reduce `arr` with `fn`.
 *
 * @param {Array} arr
 * @param {Function} fn
 * @param {Mixed} initial
 *
 * TODO: combatible error handling?
 */

module.exports = function(arr, fn, initial){  
  var idx = 0;
  var len = arr.length;
  var curr = arguments.length == 3
    ? initial
    : arr[idx++];

  while (idx < len) {
    curr = fn.call(null, curr, arr[idx], ++idx, arr);
  }
  
  return curr;
};
},{}]},{},[1])(1)
});
/*globals define, alert*/
/*jshint browser: true*/
/**
 * @author pmeijer / https://github.com/pmeijer
 */
var CREATE_BRANCH = false;
//PROJECT_NAME = 'IBug',
//BRANCH_NAME = 'master',
//NEW_BRANCH_HASH = '#d2d00cdd50a1ca144666a52a471af59d280ac751';

define('teststorage/teststorage',[
    'js/logger',
    'common/storage/browserstorage',
    'common/core/core',
    'common/storage/constants'
], function (Logger, Storage, Core, CONSTANTS) {
    
    function Client(gmeConfig, projectName, branchName) {
        var logger = Logger.create('gme:client', gmeConfig.client.log),
            storage = Storage.getStorage(logger, gmeConfig),
            currRootNode,
            currCommitObject,
            intervalId,
            core,
            PROJECT_NAME = projectName,
            BRANCH_NAME = branchName;

        logger.debug('ctor');
        function loadChildrenAndSetAttribute(rootNode, commitObject) {
            core.loadChildren(rootNode, function (err, children) {
                if (err) {
                    throw new Error(err);
                }
                logger.debug('children loaded', children);
                //children.map(function (child) {
                var newPos;
                logger.debug('child name', core.getAttribute(children[0], 'name'));
                //if (core.getAttribute(children[0], 'name') === 'newName') {
                newPos = {x: 70 + getRandomInt(0, 100), y: 70 + getRandomInt(0, 100)};
                core.setRegistry(children[0], 'position', newPos);
                logger.debug('setting new position', newPos);
                //}
                //});
                currRootNode = rootNode;
                core.persist(rootNode, function (err, persisted) {
                    if (err) {
                        throw new Error(err);
                    }
                    logger.debug('cb persist data', persisted);
                    currCommitObject = storage.makeCommit(PROJECT_NAME, BRANCH_NAME,
                        [commitObject._id],
                        persisted.rootHash,
                        persisted.objects,
                        'First commit from new storage'
                    );

                });
                //logger.debug('persistData', persistData);
                //core.loadChildren(rootNode, function (err, children) {
                //    if (err) {
                //        throw new Error(err);
                //    }
                //    logger.debug('children loaded again (should come from cache)', children);
                //});
            });
        }

        storage.open(function (status) {
            logger.debug('storage is open');
            if (status === CONSTANTS.CONNECTED) {
                storage.getProjectNames({}, function (err, projectNames) {
                    if (err) {
                        throw new Error(err);
                    }
                    if (projectNames.indexOf(projectName) < 0) {
                        throw new Error('Project does not exist');
                    }
                    logger.debug(projectNames);
                    storage.watchProject(PROJECT_NAME, function (_ws, data) {
                        logger.debug('watchProject event', data);
                    });
                    storage.openProject(PROJECT_NAME, function (err, project, branches) {
                        if (err) {
                            throw new Error(err);
                        }
                        var updateHandler = function (newCommitData) {
                            logger.debug('updateHandler invoked', newCommitData);
                            logger.debug('would call loadNodes...');
                            currCommitObject = newCommitData.commitObject;
                            core.loadRoot(newCommitData.commitObject.root, function (err, rootNode) {
                                if (err) {
                                    throw new Error(err);
                                }
                                logger.debug('rootNode loaded', rootNode);
                                currRootNode = rootNode;
                                core.loadChildren(rootNode, function (err, children) {
                                    if (err) {
                                        throw new Error(err);
                                    }
                                    logger.debug('children loaded', children);
                                    children.map(function (child) {
                                        logger.debug('child name', core.getAttribute(child, 'name'));
                                        if (core.getAttribute(child, 'name') === 'newName') {
                                            logger.debug('Got new position', core.getRegistry(child, 'position'));
                                        }
                                    });
                                });
                            });
                        };
                        var commitHandler = function (commitQueue, result, callback) {
                            logger.debug('commitHandler', result);
                            if (result.status === CONSTANTS.SYNCH) {
                                callback(true); // All is fine, continue with the commitQueue..
                            } else if (result.status === CONSTANTS.FORKED) {
                                logger.debug('You got forked, queued commits', commitQueue);
                                callback(false);
                            } else {
                                throw new Error('Unexpected result', result);
                            }
                        };
                        logger.debug('openProject project', project);
                        logger.debug('openProject returned branches', branches);
                        storage.openBranch(PROJECT_NAME, BRANCH_NAME, updateHandler, commitHandler,
                            function (err, latestCommit) {
                                if (err) {
                                    throw new Error(err);
                                }
                                logger.debug('latestCommit', latestCommit);
                                currCommitObject = latestCommit.commitObject;
                                core = new Core(project, {
                                    globConf: gmeConfig,
                                    logger: logger.fork('core')
                                });
                                logger.debug('core instantiated');
                                core.loadRoot(latestCommit.commitObject.root, function (err, rootNode) {
                                    if (err) {
                                        throw new Error(err);
                                    }
                                    logger.debug('rootNode loaded', rootNode);
                                    loadChildrenAndSetAttribute(rootNode, latestCommit.commitObject);
                                });
                            }
                        );
                        //storage.deleteBranch(PROJECT_NAME, 'b535', branches['b535'], function () {
                        //    logger.debug('branch deleted', arguments);
                        //});
                    });
                    if (CREATE_BRANCH) {
                        storage.getBranches(PROJECT_NAME, {}, function (err, data) {
                            if (err) {
                                throw new Error(err);
                            }
                            logger.debug('getBranches return', data);
                        });
                        var newBranchName = 'br' + getRandomInt(2, 9999);
                        logger.debug('will create', newBranchName);
                        setTimeout(function () {
                            storage.createBranch(PROJECT_NAME,
                                newBranchName,
                                NEW_BRANCH_HASH,
                                function (err) {
                                    if (err) {
                                        throw new Error(err);
                                    }
                                    storage.getBranches(PROJECT_NAME, {}, function (err, data) {
                                        if (err) {
                                            throw new Error(err);
                                        }
                                        logger.debug('getBranches after create returned', data);
                                    });
                                });
                        }, 2000);
                    }
                });
            } else if (status === CONSTANTS.RECONNECTED) {
                logger.debug('Reconnected!');
                clearInterval(intervalId);
            } else if (status === CONSTANTS.DISCONNECTED) {
                logger.debug('Got disconnect, waiting for reconnect...');
                intervalId = setInterval(function () {
                    loadChildrenAndSetAttribute(currRootNode, currCommitObject);
                }, 2000);
            } else if (status === CONSTANTS.ERROR) {
                throw new Error('Could not connect');
            }
        });

        function getRandomInt(min, max) {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        }
    }

    return Client;
});
/*globals define, document, console, window, GME, docReady, setTimeout*/
/*jshint browser:true, evil:true*/

/**
 * @author kecso / https://github.com/kecso
 * @author lattmann / https://github.com/lattmann
 * @author nabana / https://github.com/nabana
 * @author ksmyth / https://github.com/ksmyth
 * @author pmeijer / https://github.com/pmeijer
 */

define('webgme.classes', [
    'client/js/client',
    'blob/BlobClient',
    'executor/ExecutorClient',
    'js/Utils/InterpreterManager',
    'common/core/core',
    'common/storage/browserstorage',
    'js/logger',
    'lib/superagent/superagent-1.2.0',
    'teststorage/teststorage'
], function (Client,
             BlobClient,
             ExecutorClient,
             InterpreterManager,
             Core,
             Storage,
             Logger,
             superagent,
             TestStorage) {

    
    // Setting global classes

    GME.classes.Client = Client;
    GME.classes.BlobClient = BlobClient;
    GME.classes.ExecutorClient = ExecutorClient;
    GME.classes.InterpreterManager = InterpreterManager;
    GME.classes.Core = Core;
    GME.classes.Storage = Storage;
    GME.classes.Logger = Logger;
    GME.classes.TestStorage = TestStorage;

    // Exposing built in libraries
    GME.utils.superagent = superagent;

    // Pure JavaScript equivalent to jQuery's $.ready() from https://github.com/jfriend00/docReady

    (function (funcName, baseObj) {
        // The public function name defaults to window.docReady
        // but you can pass in your own object and own function name and those will be used
        // if you want to put them in a different namespace
        funcName = funcName || 'docReady';
        baseObj = baseObj || window;
        var readyList = [];
        var readyFired = false;
        var readyEventHandlersInstalled = false;

        // call this when the document is ready
        // this function protects itself against being called more than once
        function ready() {
            if (!readyFired) {
                // this must be set to true before we start calling callbacks
                readyFired = true;
                for (var i = 0; i < readyList.length; i++) {
                    // if a callback here happens to add new ready handlers,
                    // the docReady() function will see that it already fired
                    // and will schedule the callback to run right after
                    // this event loop finishes so all handlers will still execute
                    // in order and no new ones will be added to the readyList
                    // while we are processing the list
                    readyList[i].fn.call(window, readyList[i].ctx);
                }
                // allow any closures held by these functions to free
                readyList = [];
            }
        }

        function readyStateChange() {
            if (document.readyState === 'complete') {
                ready();
            }
        }

        // This is the one public interface
        // docReady(fn, context);
        // the context argument is optional - if present, it will be passed
        // as an argument to the callback
        baseObj[funcName] = function (callback, context) {
            // if ready has already fired, then just schedule the callback
            // to fire asynchronously, but right away
            if (readyFired) {
                setTimeout(function () {
                    callback(context);
                }, 1);
                return;
            } else {
                // add the function and context to the list
                readyList.push({fn: callback, ctx: context});
            }
            // if document already ready to go, schedule the ready function to run
            if (document.readyState === 'complete') {
                setTimeout(ready, 1);
            } else if (!readyEventHandlersInstalled) {
                // otherwise if we don't have event handlers installed, install them
                if (document.addEventListener) {
                    // first choice is DOMContentLoaded event
                    document.addEventListener('DOMContentLoaded', ready, false);
                    // backup is window load event
                    window.addEventListener('load', ready, false);
                } else {
                    // must be IE
                    document.attachEvent('onreadystatechange', readyStateChange);
                    window.attachEvent('onload', ready);
                }
                readyEventHandlersInstalled = true;
            }
        };
    })('docReady', window);

    // See if there is handler attached to body tag when ready

    var evalOnGmeInit = function () {
        if (document.body.getAttribute('on-gme-init')) {
            eval(document.body.getAttribute('on-gme-init'));
        } else {
            console.warn('To use GME, define a javascript function and set the body ' +
            'element\'s on-gme-init property.');
        }
    };

    // wait for document.readyState !== 'loading' and getGmeConfig
    var stillLoading = 2;
    var somethingFinishedLoading = function () {
        if (--stillLoading === 0) {
            evalOnGmeInit();
        }
    };

    if (document.readyState === 'loading') {
        docReady(function () {
            somethingFinishedLoading();
        });
    } else {
        somethingFinishedLoading();
    }


    (function getGmeConfig() {
        var http = new XMLHttpRequest(),
            configUrl = window.location.origin + '/gmeConfig.json';
        http.onreadystatechange = function () {
            if (http.readyState === 4 && http.status === 200) {
                GME.gmeConfig = JSON.parse(http.responseText);
                somethingFinishedLoading();
            } else if (http.readyState === 4 && http.status !== 200) {
                console.warn('Could not load gmeConfig at', configUrl);
                somethingFinishedLoading();
            }
        };
        http.open('GET', configUrl, true);
        http.send();
    })();
});


require(["webgme.classes"]);
}());
//# sourceMappingURL=webgme.classes.build.js.map