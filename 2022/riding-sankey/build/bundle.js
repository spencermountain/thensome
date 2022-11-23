var app = (function () {
    'use strict';

    function noop() { }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.29.0' }, detail)));
    }
    function append_dev(target, node) {
        dispatch_dev("SvelteDOMInsert", { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev("SvelteDOMInsert", { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev("SvelteDOMRemove", { node });
        detach(node);
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev("SvelteDOMRemoveAttribute", { node, attribute });
        else
            dispatch_dev("SvelteDOMSetAttribute", { node, attribute, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.wholeText === data)
            return;
        dispatch_dev("SvelteDOMSetData", { node: text, data });
        text.data = data;
    }
    function validate_each_argument(arg) {
        if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
            let msg = '{#each} only iterates over array-like objects.';
            if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
                msg += ' You can use a spread to convert this iterable into an array.';
            }
            throw new Error(msg);
        }
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    /* components/Head.svelte generated by Svelte v3.29.0 */

    const file = "components/Head.svelte";

    function add_css() {
    	var style = element("style");
    	style.id = "svelte-1odckek-style";
    	style.textContent = ".blue.svelte-1odckek{color:#69c}.goleft.svelte-1odckek{align-self:flex-start}.f1.svelte-1odckek{font-size:0.8rem}.m3.svelte-1odckek{margin-left:3rem;margin-top:1rem;margin-bottom:1rem}a.svelte-1odckek{color:#69c;cursor:pointer;padding:1px;text-decoration:none;border-bottom:1px solid #69c}.link.svelte-1odckek:hover{text-decoration-color:#cc7066;font-weight:500;border-bottom:1px solid #23415a}.sub.svelte-1odckek{font-size:0.7rem}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSGVhZC5zdmVsdGUiLCJzb3VyY2VzIjpbIkhlYWQuc3ZlbHRlIl0sInNvdXJjZXNDb250ZW50IjpbIjxzY3JpcHQ+XG4gIGxldCB5ZWFyID0gbmV3IERhdGUoKS5nZXRGdWxsWWVhcigpXG4gIGV4cG9ydCBsZXQgbnVtID0gJzAxJ1xuICBleHBvcnQgbGV0IHRpdGxlID0gJydcbiAgZXhwb3J0IGxldCBzdWIgPSAnJ1xuPC9zY3JpcHQ+XG5cbjwhLS0gdGl0bGUgLS0+XG48ZGl2IGNsYXNzPVwiYmx1ZSBtbDEgZ29sZWZ0IGxlZnRcIj5cbiAgPGEgY2xhc3M9XCJsaW5rIGYxIGJsdWVcIiBocmVmPVwiLi4vLi4vXCI+44CxIC4ve3llYXJ9LyB7bnVtfTwvYT5cbjwvZGl2PlxueyNpZiB0aXRsZX1cbiAgPGRpdiBjbGFzcz1cIm0zXCI+XG4gICAgPHNwYW4gY2xhc3M9XCJtbDIgZ3JleVwiPnt0aXRsZX08L3NwYW4+XG4gICAgPGRpdiBjbGFzcz1cImJyb3duIG1sMSBzdWJcIj57c3VifTwvZGl2PlxuICA8L2Rpdj5cbnsvaWZ9XG5cbjxzdHlsZT5cbiAgLmJsdWUge1xuICAgIGNvbG9yOiAjNjljO1xuICB9XG4gIC5nb2xlZnQge1xuICAgIGFsaWduLXNlbGY6IGZsZXgtc3RhcnQ7XG4gIH1cbiAgLmYxIHtcbiAgICBmb250LXNpemU6IDAuOHJlbTtcbiAgfVxuICAubTMge1xuICAgIG1hcmdpbi1sZWZ0OiAzcmVtO1xuICAgIG1hcmdpbi10b3A6IDFyZW07XG4gICAgbWFyZ2luLWJvdHRvbTogMXJlbTtcbiAgfVxuICBhIHtcbiAgICBjb2xvcjogIzY5YztcbiAgICBjdXJzb3I6IHBvaW50ZXI7XG4gICAgcGFkZGluZzogMXB4O1xuICAgIHRleHQtZGVjb3JhdGlvbjogbm9uZTtcbiAgICBib3JkZXItYm90dG9tOiAxcHggc29saWQgIzY5YztcbiAgfVxuICAubGluazpob3ZlciB7XG4gICAgdGV4dC1kZWNvcmF0aW9uLWNvbG9yOiAjY2M3MDY2O1xuICAgIGZvbnQtd2VpZ2h0OiA1MDA7XG4gICAgLyogYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkI2NjNzA2NjsgKi9cbiAgICBib3JkZXItYm90dG9tOiAxcHggc29saWQgIzIzNDE1YTtcbiAgfVxuICAuc3ViIHtcbiAgICBmb250LXNpemU6IDAuN3JlbTtcbiAgfVxuPC9zdHlsZT5cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFtQkUsS0FBSyxlQUFDLENBQUMsQUFDTCxLQUFLLENBQUUsSUFBSSxBQUNiLENBQUMsQUFDRCxPQUFPLGVBQUMsQ0FBQyxBQUNQLFVBQVUsQ0FBRSxVQUFVLEFBQ3hCLENBQUMsQUFDRCxHQUFHLGVBQUMsQ0FBQyxBQUNILFNBQVMsQ0FBRSxNQUFNLEFBQ25CLENBQUMsQUFDRCxHQUFHLGVBQUMsQ0FBQyxBQUNILFdBQVcsQ0FBRSxJQUFJLENBQ2pCLFVBQVUsQ0FBRSxJQUFJLENBQ2hCLGFBQWEsQ0FBRSxJQUFJLEFBQ3JCLENBQUMsQUFDRCxDQUFDLGVBQUMsQ0FBQyxBQUNELEtBQUssQ0FBRSxJQUFJLENBQ1gsTUFBTSxDQUFFLE9BQU8sQ0FDZixPQUFPLENBQUUsR0FBRyxDQUNaLGVBQWUsQ0FBRSxJQUFJLENBQ3JCLGFBQWEsQ0FBRSxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksQUFDL0IsQ0FBQyxBQUNELG9CQUFLLE1BQU0sQUFBQyxDQUFDLEFBQ1gscUJBQXFCLENBQUUsT0FBTyxDQUM5QixXQUFXLENBQUUsR0FBRyxDQUVoQixhQUFhLENBQUUsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLEFBQ2xDLENBQUMsQUFDRCxJQUFJLGVBQUMsQ0FBQyxBQUNKLFNBQVMsQ0FBRSxNQUFNLEFBQ25CLENBQUMifQ== */";
    	append_dev(document.head, style);
    }

    // (12:0) {#if title}
    function create_if_block(ctx) {
    	let div1;
    	let span;
    	let t0;
    	let t1;
    	let div0;
    	let t2;

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			span = element("span");
    			t0 = text(/*title*/ ctx[1]);
    			t1 = space();
    			div0 = element("div");
    			t2 = text(/*sub*/ ctx[2]);
    			attr_dev(span, "class", "ml2 grey");
    			add_location(span, file, 13, 4, 282);
    			attr_dev(div0, "class", "brown ml1 sub svelte-1odckek");
    			add_location(div0, file, 14, 4, 324);
    			attr_dev(div1, "class", "m3 svelte-1odckek");
    			add_location(div1, file, 12, 2, 261);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, span);
    			append_dev(span, t0);
    			append_dev(div1, t1);
    			append_dev(div1, div0);
    			append_dev(div0, t2);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*title*/ 2) set_data_dev(t0, /*title*/ ctx[1]);
    			if (dirty & /*sub*/ 4) set_data_dev(t2, /*sub*/ ctx[2]);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(12:0) {#if title}",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let div;
    	let a;
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let t4;
    	let if_block_anchor;
    	let if_block = /*title*/ ctx[1] && create_if_block(ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			a = element("a");
    			t0 = text("〱 ./");
    			t1 = text(/*year*/ ctx[3]);
    			t2 = text("/ ");
    			t3 = text(/*num*/ ctx[0]);
    			t4 = space();
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    			attr_dev(a, "class", "link f1 blue svelte-1odckek");
    			attr_dev(a, "href", "../../");
    			add_location(a, file, 9, 2, 180);
    			attr_dev(div, "class", "blue ml1 goleft left svelte-1odckek");
    			add_location(div, file, 8, 0, 143);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, a);
    			append_dev(a, t0);
    			append_dev(a, t1);
    			append_dev(a, t2);
    			append_dev(a, t3);
    			insert_dev(target, t4, anchor);
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*num*/ 1) set_data_dev(t3, /*num*/ ctx[0]);

    			if (/*title*/ ctx[1]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (detaching) detach_dev(t4);
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Head", slots, []);
    	let year = new Date().getFullYear();
    	let { num = "01" } = $$props;
    	let { title = "" } = $$props;
    	let { sub = "" } = $$props;
    	const writable_props = ["num", "title", "sub"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Head> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("num" in $$props) $$invalidate(0, num = $$props.num);
    		if ("title" in $$props) $$invalidate(1, title = $$props.title);
    		if ("sub" in $$props) $$invalidate(2, sub = $$props.sub);
    	};

    	$$self.$capture_state = () => ({ year, num, title, sub });

    	$$self.$inject_state = $$props => {
    		if ("year" in $$props) $$invalidate(3, year = $$props.year);
    		if ("num" in $$props) $$invalidate(0, num = $$props.num);
    		if ("title" in $$props) $$invalidate(1, title = $$props.title);
    		if ("sub" in $$props) $$invalidate(2, sub = $$props.sub);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [num, title, sub, year];
    }

    class Head extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		if (!document.getElementById("svelte-1odckek-style")) add_css();
    		init(this, options, instance, create_fragment, safe_not_equal, { num: 0, title: 1, sub: 2 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Head",
    			options,
    			id: create_fragment.name
    		});
    	}

    	get num() {
    		throw new Error("<Head>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set num(value) {
    		throw new Error("<Head>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get title() {
    		throw new Error("<Head>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set title(value) {
    		throw new Error("<Head>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get sub() {
    		throw new Error("<Head>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set sub(value) {
    		throw new Error("<Head>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* components/Foot.svelte generated by Svelte v3.29.0 */

    const file$1 = "components/Foot.svelte";

    function add_css$1() {
    	var style = element("style");
    	style.id = "svelte-1xt868z-style";
    	style.textContent = ".footer.svelte-1xt868z{display:flex;margin:auto 1rem 1rem auto;padding:0.5rem;justify-content:flex-end;align-content:flex-end;align-items:center;padding-top:5rem;width:100%;font-size:0.8rem}.m2.svelte-1xt868z{margin:1.5rem}a.svelte-1xt868z{color:#69c;cursor:pointer;text-decoration:underline}a.svelte-1xt868z:hover{text-decoration-color:#cc7066}.name.svelte-1xt868z{margin-right:4rem}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRm9vdC5zdmVsdGUiLCJzb3VyY2VzIjpbIkZvb3Quc3ZlbHRlIl0sInNvdXJjZXNDb250ZW50IjpbIjxzY3JpcHQ+XG4gIGV4cG9ydCBsZXQgbnVtID0gJydcbiAgZXhwb3J0IGxldCB5ZWFyID0gJydcbjwvc2NyaXB0PlxuXG48c3R5bGU+XG4gIC5mb290ZXIge1xuICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgbWFyZ2luOiBhdXRvIDFyZW0gMXJlbSBhdXRvO1xuICAgIHBhZGRpbmc6IDAuNXJlbTtcbiAgICBqdXN0aWZ5LWNvbnRlbnQ6IGZsZXgtZW5kO1xuICAgIGFsaWduLWNvbnRlbnQ6IGZsZXgtZW5kO1xuICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgcGFkZGluZy10b3A6IDVyZW07XG4gICAgd2lkdGg6IDEwMCU7XG4gICAgZm9udC1zaXplOiAwLjhyZW07XG4gIH1cbiAgLm0yIHtcbiAgICBtYXJnaW46IDEuNXJlbTtcbiAgfVxuICBhIHtcbiAgICBjb2xvcjogIzY5YztcbiAgICBjdXJzb3I6IHBvaW50ZXI7XG4gICAgdGV4dC1kZWNvcmF0aW9uOiB1bmRlcmxpbmU7XG4gIH1cbiAgYTpob3ZlciB7XG4gICAgdGV4dC1kZWNvcmF0aW9uLWNvbG9yOiAjY2M3MDY2O1xuICB9XG4gIC5uYW1lIHtcbiAgICBtYXJnaW4tcmlnaHQ6IDRyZW07XG4gIH1cbjwvc3R5bGU+XG5cbjwhLS0gZm9vdGVyIC0tPlxuPGRpdiBjbGFzcz1cImZvb3RlclwiPlxuICB7I2lmIG51bSAmJiB5ZWFyfVxuICAgIDxhIGNsYXNzPVwibTJcIiBocmVmPVwiaHR0cHM6Ly9naXRodWIuY29tL3NwZW5jZXJtb3VudGFpbi90aGVuc29tZS90cmVlL2doLXBhZ2VzL3t5ZWFyfS97bnVtfVwiPlxuICAgICAgc291cmNlXG4gICAgPC9hPlxuICB7OmVsc2V9XG4gICAgPGEgY2xhc3M9XCJtMlwiIGhyZWY9XCJodHRwczovL2dpdGh1Yi5jb20vc3BlbmNlcm1vdW50YWluL3RoZW5zb21lXCI+c291cmNlPC9hPlxuICB7L2lmfVxuICA8YSBjbGFzcz1cIm5hbWVcIiBocmVmPVwiaHR0cDovL3R3aXR0ZXIuY29tL3NwZW5jZXJtb3VudGFpbi9cIj5Ac3BlbmNlcm1vdW50YWluPC9hPlxuPC9kaXY+XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBTUUsT0FBTyxlQUFDLENBQUMsQUFDUCxPQUFPLENBQUUsSUFBSSxDQUNiLE1BQU0sQ0FBRSxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQzNCLE9BQU8sQ0FBRSxNQUFNLENBQ2YsZUFBZSxDQUFFLFFBQVEsQ0FDekIsYUFBYSxDQUFFLFFBQVEsQ0FDdkIsV0FBVyxDQUFFLE1BQU0sQ0FDbkIsV0FBVyxDQUFFLElBQUksQ0FDakIsS0FBSyxDQUFFLElBQUksQ0FDWCxTQUFTLENBQUUsTUFBTSxBQUNuQixDQUFDLEFBQ0QsR0FBRyxlQUFDLENBQUMsQUFDSCxNQUFNLENBQUUsTUFBTSxBQUNoQixDQUFDLEFBQ0QsQ0FBQyxlQUFDLENBQUMsQUFDRCxLQUFLLENBQUUsSUFBSSxDQUNYLE1BQU0sQ0FBRSxPQUFPLENBQ2YsZUFBZSxDQUFFLFNBQVMsQUFDNUIsQ0FBQyxBQUNELGdCQUFDLE1BQU0sQUFBQyxDQUFDLEFBQ1AscUJBQXFCLENBQUUsT0FBTyxBQUNoQyxDQUFDLEFBQ0QsS0FBSyxlQUFDLENBQUMsQUFDTCxZQUFZLENBQUUsSUFBSSxBQUNwQixDQUFDIn0= */";
    	append_dev(document.head, style);
    }

    // (40:2) {:else}
    function create_else_block(ctx) {
    	let a;

    	const block = {
    		c: function create() {
    			a = element("a");
    			a.textContent = "source";
    			attr_dev(a, "class", "m2 svelte-1xt868z");
    			attr_dev(a, "href", "https://github.com/spencermountain/thensome");
    			add_location(a, file$1, 40, 4, 712);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, a, anchor);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(a);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block.name,
    		type: "else",
    		source: "(40:2) {:else}",
    		ctx
    	});

    	return block;
    }

    // (36:2) {#if num && year}
    function create_if_block$1(ctx) {
    	let a;
    	let t;
    	let a_href_value;

    	const block = {
    		c: function create() {
    			a = element("a");
    			t = text("source");
    			attr_dev(a, "class", "m2 svelte-1xt868z");
    			attr_dev(a, "href", a_href_value = "https://github.com/spencermountain/thensome/tree/gh-pages/" + /*year*/ ctx[1] + "/" + /*num*/ ctx[0]);
    			add_location(a, file$1, 36, 4, 583);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, a, anchor);
    			append_dev(a, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*year, num*/ 3 && a_href_value !== (a_href_value = "https://github.com/spencermountain/thensome/tree/gh-pages/" + /*year*/ ctx[1] + "/" + /*num*/ ctx[0])) {
    				attr_dev(a, "href", a_href_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(a);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(36:2) {#if num && year}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$1(ctx) {
    	let div;
    	let t0;
    	let a;

    	function select_block_type(ctx, dirty) {
    		if (/*num*/ ctx[0] && /*year*/ ctx[1]) return create_if_block$1;
    		return create_else_block;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			if_block.c();
    			t0 = space();
    			a = element("a");
    			a.textContent = "@spencermountain";
    			attr_dev(a, "class", "name svelte-1xt868z");
    			attr_dev(a, "href", "http://twitter.com/spencermountain/");
    			add_location(a, file$1, 42, 2, 798);
    			attr_dev(div, "class", "footer svelte-1xt868z");
    			add_location(div, file$1, 34, 0, 538);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			if_block.m(div, null);
    			append_dev(div, t0);
    			append_dev(div, a);
    		},
    		p: function update(ctx, [dirty]) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(div, t0);
    				}
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if_block.d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Foot", slots, []);
    	let { num = "" } = $$props;
    	let { year = "" } = $$props;
    	const writable_props = ["num", "year"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Foot> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("num" in $$props) $$invalidate(0, num = $$props.num);
    		if ("year" in $$props) $$invalidate(1, year = $$props.year);
    	};

    	$$self.$capture_state = () => ({ num, year });

    	$$self.$inject_state = $$props => {
    		if ("num" in $$props) $$invalidate(0, num = $$props.num);
    		if ("year" in $$props) $$invalidate(1, year = $$props.year);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [num, year];
    }

    class Foot extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		if (!document.getElementById("svelte-1xt868z-style")) add_css$1();
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { num: 0, year: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Foot",
    			options,
    			id: create_fragment$1.name
    		});
    	}

    	get num() {
    		throw new Error("<Foot>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set num(value) {
    		throw new Error("<Foot>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get year() {
    		throw new Error("<Foot>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set year(value) {
    		throw new Error("<Foot>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    function noop$1() { }
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function add_location$1(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run$1(fn) {
        return fn();
    }
    function blank_object$1() {
        return Object.create(null);
    }
    function run_all$1(fns) {
        fns.forEach(run$1);
    }
    function is_function$1(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal$1(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty$1(obj) {
        return Object.keys(obj).length === 0;
    }
    function validate_store(store, name) {
        if (store != null && typeof store.subscribe !== 'function') {
            throw new Error(`'${name}' is not a store with a 'subscribe' method`);
        }
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop$1;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if ($$scope.dirty === undefined) {
                return lets;
            }
            if (typeof lets === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }
    function update_slot(slot, slot_definition, ctx, $$scope, dirty, get_slot_changes_fn, get_slot_context_fn) {
        const slot_changes = get_slot_changes(slot_definition, $$scope, dirty, get_slot_changes_fn);
        if (slot_changes) {
            const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
            slot.p(slot_context, slot_changes);
        }
    }
    function set_store_value(store, ret, value = ret) {
        store.set(value);
        return ret;
    }

    function append$1(target, node) {
        target.appendChild(node);
    }
    function insert$1(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach$1(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each$1(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element$1(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text$1(data) {
        return document.createTextNode(data);
    }
    function space$1() {
        return text$1(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr$1(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children$1(element) {
        return Array.from(element.childNodes);
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    // unfortunately this can't be a constant as that wouldn't be tree-shakeable
    // so we cache the result instead
    let crossorigin;
    function is_crossorigin() {
        if (crossorigin === undefined) {
            crossorigin = false;
            try {
                if (typeof window !== 'undefined' && window.parent) {
                    void window.parent.document;
                }
            }
            catch (error) {
                crossorigin = true;
            }
        }
        return crossorigin;
    }
    function add_resize_listener(node, fn) {
        const computed_style = getComputedStyle(node);
        const z_index = (parseInt(computed_style.zIndex) || 0) - 1;
        if (computed_style.position === 'static') {
            node.style.position = 'relative';
        }
        const iframe = element$1('iframe');
        iframe.setAttribute('style', `display: block; position: absolute; top: 0; left: 0; width: 100%; height: 100%; ` +
            `overflow: hidden; border: 0; opacity: 0; pointer-events: none; z-index: ${z_index};`);
        iframe.setAttribute('aria-hidden', 'true');
        iframe.tabIndex = -1;
        const crossorigin = is_crossorigin();
        let unsubscribe;
        if (crossorigin) {
            iframe.src = `data:text/html,<script>onresize=function(){parent.postMessage(0,'*')}</script>`;
            unsubscribe = listen(window, 'message', (event) => {
                if (event.source === iframe.contentWindow)
                    fn();
            });
        }
        else {
            iframe.src = 'about:blank';
            iframe.onload = () => {
                unsubscribe = listen(iframe.contentWindow, 'resize', fn);
            };
        }
        append$1(node, iframe);
        return () => {
            if (crossorigin) {
                unsubscribe();
            }
            else if (unsubscribe && iframe.contentWindow) {
                unsubscribe();
            }
            detach$1(iframe);
        };
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event$1(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component$1;
    function set_current_component$1(component) {
        current_component$1 = component;
    }
    function get_current_component() {
        if (!current_component$1)
            throw new Error(`Function called outside component initialization`);
        return current_component$1;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function setContext(key, context) {
        get_current_component().$$.context.set(key, context);
    }
    function getContext(key) {
        return get_current_component().$$.context.get(key);
    }

    const dirty_components$1 = [];
    const binding_callbacks$1 = [];
    const render_callbacks$1 = [];
    const flush_callbacks$1 = [];
    const resolved_promise$1 = Promise.resolve();
    let update_scheduled$1 = false;
    function schedule_update$1() {
        if (!update_scheduled$1) {
            update_scheduled$1 = true;
            resolved_promise$1.then(flush$1);
        }
    }
    function add_render_callback$1(fn) {
        render_callbacks$1.push(fn);
    }
    let flushing$1 = false;
    const seen_callbacks$1 = new Set();
    function flush$1() {
        if (flushing$1)
            return;
        flushing$1 = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components$1.length; i += 1) {
                const component = dirty_components$1[i];
                set_current_component$1(component);
                update$1(component.$$);
            }
            dirty_components$1.length = 0;
            while (binding_callbacks$1.length)
                binding_callbacks$1.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks$1.length; i += 1) {
                const callback = render_callbacks$1[i];
                if (!seen_callbacks$1.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks$1.add(callback);
                    callback();
                }
            }
            render_callbacks$1.length = 0;
        } while (dirty_components$1.length);
        while (flush_callbacks$1.length) {
            flush_callbacks$1.pop()();
        }
        update_scheduled$1 = false;
        flushing$1 = false;
        seen_callbacks$1.clear();
    }
    function update$1($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all$1($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback$1);
        }
    }
    const outroing$1 = new Set();
    let outros$1;
    function group_outros$1() {
        outros$1 = {
            r: 0,
            c: [],
            p: outros$1 // parent group
        };
    }
    function check_outros$1() {
        if (!outros$1.r) {
            run_all$1(outros$1.c);
        }
        outros$1 = outros$1.p;
    }
    function transition_in$1(block, local) {
        if (block && block.i) {
            outroing$1.delete(block);
            block.i(local);
        }
    }
    function transition_out$1(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing$1.has(block))
                return;
            outroing$1.add(block);
            outros$1.c.push(() => {
                outroing$1.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }

    const globals = (typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
            ? globalThis
            : global);
    function create_component$1(block) {
        block && block.c();
    }
    function mount_component$1(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback$1(() => {
            const new_on_destroy = on_mount.map(run$1).filter(is_function$1);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all$1(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback$1);
    }
    function destroy_component$1(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all$1($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty$1(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components$1.push(component);
            schedule_update$1();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init$1(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component$1;
        set_current_component$1(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop$1,
            not_equal,
            bound: blank_object$1(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object$1(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty$1(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all$1($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children$1(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach$1);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in$1(component.$$.fragment);
            mount_component$1(component, options.target, options.anchor);
            flush$1();
        }
        set_current_component$1(parent_component);
    }
    class SvelteComponent$1 {
        $destroy() {
            destroy_component$1(this, 1);
            this.$destroy = noop$1;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty$1($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev$1(type, detail) {
        document.dispatchEvent(custom_event$1(type, Object.assign({ version: '3.24.1' }, detail)));
    }
    function append_dev$1(target, node) {
        dispatch_dev$1("SvelteDOMInsert", { target, node });
        append$1(target, node);
    }
    function insert_dev$1(target, node, anchor) {
        dispatch_dev$1("SvelteDOMInsert", { target, node, anchor });
        insert$1(target, node, anchor);
    }
    function detach_dev$1(node) {
        dispatch_dev$1("SvelteDOMRemove", { node });
        detach$1(node);
    }
    function attr_dev$1(node, attribute, value) {
        attr$1(node, attribute, value);
        if (value == null)
            dispatch_dev$1("SvelteDOMRemoveAttribute", { node, attribute });
        else
            dispatch_dev$1("SvelteDOMSetAttribute", { node, attribute, value });
    }
    function set_data_dev$1(text, data) {
        data = '' + data;
        if (text.wholeText === data)
            return;
        dispatch_dev$1("SvelteDOMSetData", { node: text, data });
        text.data = data;
    }
    function validate_each_argument$1(arg) {
        if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
            let msg = '{#each} only iterates over array-like objects.';
            if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
                msg += ' You can use a spread to convert this iterable into an array.';
            }
            throw new Error(msg);
        }
    }
    function validate_slots$1(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    class SvelteComponentDev$1 extends SvelteComponent$1 {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    // add forward/backwards links
    const addLinks = function (byCol) {
      byCol.forEach((nodes, i) => {
        nodes.forEach((node) => {
          if (node.to && byCol[i + 1]) {
            let foundTo = byCol[i + 1].find((n) => n.name === node.to);
            if (foundTo) {
              node.tos.push(foundTo);
              foundTo.froms.push(node);
            }
          }
          // allow backward-set links, too
          if (node.from && byCol[i - 1]) {
            let found = byCol[i - 1].find((n) => n.name === node.from);
            // found.tos.push(node)
            // node.froms.push(found)
          }
        });
      });
    };

    const addStack = function (byCol) {
      byCol.forEach((nodes) => {
        let lastOne = null;
        nodes.forEach((node) => {
          if (node.to === lastOne) {
            node.stacked = true;
          }
          lastOne = node.to;
        });
      });
    };

    const byColumn = function (items) {
      let byCol = [];
      items.forEach((node) => {
        if (node.value) {
          node.value = Number(node.value);
        }
        byCol[node.col] = byCol[node.col] || [];
        node.top = 0;
        node.inputs = 0;
        node.froms = [];
        node.stacked = false;

        node.tos = [];
        byCol[node.col].push(node);
      });
      byCol.shift();
      return byCol
    };

    // turn into array of arrays (by Column)
    const fmt = function (items) {
      let byCol = byColumn(items);
      addLinks(byCol);
      addStack(byCol);
      return byCol
    };

    //get value from sum of inputs
    const getValues = function (byCol) {
      byCol.forEach((nodes) => {
        nodes.forEach((node) => {
          node.sum = 0;
          node.froms.forEach((n) => (node.sum += n.value));
          if (node.sum > node.value) {
            node.value = node.sum;
          }
        });
      });
      return byCol
    };

    const bySum = function (byCol) {
      byCol.forEach((nodes) => {
        let already = 0;
        nodes.forEach((node) => {
          node.top = already;
          already += node.value;
        });
      });
      return byCol
    };

    // align each node with right-node
    const byNeighbour = function (byCol) {
      byCol.forEach((nodes) => {
        nodes.forEach((node, n) => {
          if (node.tos.length === 1 && node.tos[0].top > node.top) {
            console.log('moving ' + node.name);
            node.top = node.tos[0].top;
            // move down stacked-nodes as well
            let already = node.top + node.value;
            for (let i = n + 1; i < nodes.length; i += 1) {
              // console.log('... and moving ' + nodes[i].name)
              if (nodes[i].stacked === true) {
                nodes[i].top = already;
                already += nodes[i].value;
              } else {
                break
              }
            }
          }
        });
      });
      return byCol
    };

    const getMax = function (byCol) {
      let max = 0;
      byCol.forEach((nodes) => {
        nodes.forEach((node) => {
          let total = node.top + node.value;
          if (total > max) {
            max = total;
          }
        });
      });
      return max
    };

    // splay-out stacked nodes a bit
    const addMargin = function (byCol) {
      let max = getMax(byCol);
      let margin = max * 0.015;
      byCol.forEach((nodes) => {
        let count = 1;
        nodes.forEach((node) => {
          if (node.stacked) {
            node.top += margin * count;
            count += 1;
          } else {
            count = 1;
          }
        });
      });
      return byCol
    };

    const findStart = function (byCol) {
      byCol = bySum(byCol);
      // wiggle-this out by right-neighbour
      byCol = byNeighbour(byCol);
      byCol = addMargin(byCol);
      byCol = byNeighbour(byCol);
      return byCol
    };

    //a very-tiny version of d3-scale's scaleLinear
    const scaleLinear = function (obj) {
      let world = obj.world || [];
      let minmax = obj.minmax || obj.minMax || [];
      const calc = (num) => {
        let range = minmax[1] - minmax[0];
        let percent = (num - minmax[0]) / range;
        let size = world[1] - world[0];
        return parseInt(size * percent, 10)
      };

      return calc
    };

    // let scale = scaleLinear({
    //   world: [0, 300],
    //   minmax: [0, 100]
    // })
    // console.log(scale(50))

    const topRoom = 20;

    const getMax$1 = function (byCol) {
      let max = 0;
      byCol.forEach((nodes) => {
        nodes.forEach((node) => {
          let total = node.top + node.value;
          if (total > max) {
            max = total;
          }
        });
      });
      return max
    };
    const getTotal = function (nodes) {
      let total = 0;
      nodes.forEach((node) => {
        total += node.value;
      });
      return total
    };

    const applyDx = function (node) {
      if (node.dx) {
        node.x += node.dx;
      }
      if (node.dy) {
        node.y += node.dy;
      }
      return node
    };

    const shrinkLongNodes = function (byCol) {
      byCol.forEach((nodes) => {
        if (nodes.length === 1) {
          nodes[0].y += topRoom;
        }
      });
    };

    const percent = (part, total) => {
      let num = (part / total) * 100;
      num = Math.round(num);
      return num + '%'
    };

    const makePoints = function (byCol, width, height, nodeWidth, labels) {
      let max = getMax$1(byCol);
      let half = nodeWidth / 2;
      let yScale = scaleLinear({ minmax: [0, max], world: [0, height - topRoom] });
      let xScale = scaleLinear({ minmax: [0, byCol.length], world: [0, width] });
      byCol.forEach((nodes) => {
        let total = getTotal(nodes);
        nodes.forEach((node) => {
          node.y = yScale(node.top);
          node.percent = percent(node.value, total);
          node.height = yScale(node.value);
          node.x = xScale(node.col - 1) + half;
          node.width = nodeWidth;
          node = applyDx(node);
        });
      });
      labels.forEach(o => {
        o.x = xScale(o.col - 2) + nodeWidth * 1.5;
        o.start = yScale(Number(o.start));
        o.end = yScale(Number(o.end));
        o.width = nodeWidth;
      });
      // give cols with many margins more space
      shrinkLongNodes(byCol);
      return byCol
    };

    const pinchDown = function (from, to) {
      return ` L${to[0]},${to[1]}`
      // return ` S${from[0] + 50},${from[1] + 15}   ${to[0]},${to[1]}`
    };
    const pinchUp = function (from, to) {
      return ` L${to[0]},${to[1]}`
      // return ` S${from[0] + 50},${from[1] - 15}   ${to[0]},${to[1]}`
    };

    const makePath = function (from, to) {
      let already = from.alreadyFrom;
      let path = `M${from.x + from.width},${from.y + already}`; // (source-top)
      // dest-top
      path += ` L${to.x},${to.y}`;
      // dest-bottom
      path += ` L${to.x},${to.y + to.height}`;
      // source-bottom
      path += ` L${from.x + from.width},${from.y + to.height + already}`;
      path += ` Z`;
      return path
    };

    const backwardPaths = function (nodes) {
      let paths = [];
      nodes.forEach((to) => {
        if (to.from) {
          let source = nodes.find((n) => n.name === to.from);
          source.alreadyFrom = source.alreadyFrom || 0;
          let path = makePath(source, to);
          source.alreadyFrom += to.height;
          paths.push(path);
        }
      });
      return paths
    };

    const makePaths = function (nodes) {
      let paths = [];
      nodes.forEach((node) => {
        let fromX = node.x + node.width;
        let fromY = node.y;
        let h = node.height;
        node.tos.forEach((to) => {
          to.already = to.already || 0;
          // node top-right
          let d = `M${fromX},${fromY}`;
          // dest top-left
          d += pinchDown([fromX, fromY], [to.x, to.y + to.already]);
          // dest bottom-left
          d += ` L${to.x},${to.y + h + to.already}`;
          // back to bottom of node
          d += pinchUp([to.x, to.y + h + to.already], [fromX, fromY + h]);
          // fill it
          d += ` Z`;
          to.already += node.height;

          paths.push(d);
        });
      });
      let backward = backwardPaths(nodes);
      paths = paths.concat(backward);
      return paths
    };

    let toFlat = function (byCol) {
      let list = [];
      byCol.forEach((nodes) => {
        nodes.forEach((node) => {
          list.push(node);
        });
      });
      // remove empty nodes
      list = list.filter((n) => n.value);
      return list
    };

    const layout = function (items, width, height, nodeWidth, labels) {
      let byCol = fmt(items);
      // add value
      byCol = getValues(byCol);
      // add top
      byCol = findStart(byCol);
      // add x, y, width, height
      byCol = makePoints(byCol, width, height, nodeWidth, labels);

      let nodes = toFlat(byCol);
      let paths = makePaths(nodes);

      return {
        nodes: nodes,
        paths: paths,
        nodeWidth: nodeWidth,
        labels
      }
    };

    /* Users/spencer/mountain/somehow-sankey/src/Dots.svelte generated by Svelte v3.29.0 */

    const file$2 = "Users/spencer/mountain/somehow-sankey/src/Dots.svelte";

    function create_fragment$2(ctx) {
    	let svg;
    	let defs;
    	let pattern;
    	let circle;
    	let rect;
    	let rect_fill_value;

    	const block = {
    		c: function create() {
    			svg = svg_element("svg");
    			defs = svg_element("defs");
    			pattern = svg_element("pattern");
    			circle = svg_element("circle");
    			rect = svg_element("rect");
    			attr_dev$1(circle, "fill", /*color*/ ctx[0]);
    			attr_dev$1(circle, "cx", "4");
    			attr_dev$1(circle, "cy", "4");
    			attr_dev$1(circle, "r", "2");
    			add_location$1(circle, file$2, 25, 6, 449);
    			attr_dev$1(pattern, "id", /*id*/ ctx[1]);
    			attr_dev$1(pattern, "x", "0");
    			attr_dev$1(pattern, "y", "0");
    			attr_dev$1(pattern, "width", "6");
    			attr_dev$1(pattern, "height", "6");
    			attr_dev$1(pattern, "patternUnits", "userSpaceOnUse");
    			add_location$1(pattern, file$2, 18, 4, 329);
    			add_location$1(defs, file$2, 17, 2, 318);
    			attr_dev$1(rect, "x", "0");
    			attr_dev$1(rect, "y", "0");
    			attr_dev$1(rect, "width", "100%");
    			attr_dev$1(rect, "height", "100%");
    			attr_dev$1(rect, "fill", rect_fill_value = "url(#" + /*id*/ ctx[1] + ")");
    			add_location$1(rect, file$2, 29, 2, 521);
    			attr_dev$1(svg, "width", "100%");
    			attr_dev$1(svg, "height", "100%");
    			add_location$1(svg, file$2, 16, 0, 283);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev$1(target, svg, anchor);
    			append_dev$1(svg, defs);
    			append_dev$1(defs, pattern);
    			append_dev$1(pattern, circle);
    			append_dev$1(svg, rect);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*color*/ 1) {
    				attr_dev$1(circle, "fill", /*color*/ ctx[0]);
    			}
    		},
    		i: noop$1,
    		o: noop$1,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev$1(svg);
    		}
    	};

    	dispatch_dev$1("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function uuid() {
    	return ("xxxxxx").replace(/[xy]/g, function (c) {
    		var r = Math.random() * 16 | 0, v = c == "x" ? r : r & 3 | 8;
    		return v.toString(16);
    	});
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots$1("Dots", slots, []);
    	let { color = "steelblue" } = $$props;
    	let id = uuid();
    	const writable_props = ["color"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Dots> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("color" in $$props) $$invalidate(0, color = $$props.color);
    	};

    	$$self.$capture_state = () => ({ color, uuid, id });

    	$$self.$inject_state = $$props => {
    		if ("color" in $$props) $$invalidate(0, color = $$props.color);
    		if ("id" in $$props) $$invalidate(1, id = $$props.id);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [color, id];
    }

    class Dots extends SvelteComponentDev$1 {
    	constructor(options) {
    		super(options);
    		init$1(this, options, instance$2, create_fragment$2, safe_not_equal$1, { color: 0 });

    		dispatch_dev$1("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Dots",
    			options,
    			id: create_fragment$2.name
    		});
    	}

    	get color() {
    		throw new Error("<Dots>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set color(value) {
    		throw new Error("<Dots>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    const subscriber_queue = [];
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop$1) {
        let stop;
        const subscribers = [];
        function set(new_value) {
            if (safe_not_equal$1(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (let i = 0; i < subscribers.length; i += 1) {
                        const s = subscribers[i];
                        s[1]();
                        subscriber_queue.push(s, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop$1) {
            const subscriber = [run, invalidate];
            subscribers.push(subscriber);
            if (subscribers.length === 1) {
                stop = start(set) || noop$1;
            }
            run(value);
            return () => {
                const index = subscribers.indexOf(subscriber);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
                if (subscribers.length === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }

    const items = writable([]);
    const labels = writable([]);
    let colCount = writable(0);

    function createCommonjsModule(fn, basedir, module) {
    	return module = {
    		path: basedir,
    		exports: {},
    		require: function (path, base) {
    			return commonjsRequire(path, (base === undefined || base === null) ? module.path : base);
    		}
    	}, fn(module, module.exports), module.exports;
    }

    function commonjsRequire () {
    	throw new Error('Dynamic requires are not currently supported by @rollup/plugin-commonjs');
    }

    var spencerColor = createCommonjsModule(function (module, exports) {
    !function(e){module.exports=e();}(function(){return function u(i,a,c){function f(r,e){if(!a[r]){if(!i[r]){var o="function"==typeof commonjsRequire&&commonjsRequire;if(!e&&o)return o(r,!0);if(d)return d(r,!0);var n=new Error("Cannot find module '"+r+"'");throw n.code="MODULE_NOT_FOUND",n}var t=a[r]={exports:{}};i[r][0].call(t.exports,function(e){return f(i[r][1][e]||e)},t,t.exports,u,i,a,c);}return a[r].exports}for(var d="function"==typeof commonjsRequire&&commonjsRequire,e=0;e<c.length;e++)f(c[e]);return f}({1:[function(e,r,o){r.exports={blue:"#6699cc",green:"#6accb2",yellow:"#e1e6b3",red:"#cc7066",pink:"#F2C0BB",brown:"#705E5C",orange:"#cc8a66",purple:"#d8b3e6",navy:"#335799",olive:"#7f9c6c",fuscia:"#735873",beige:"#e6d7b3",slate:"#8C8C88",suede:"#9c896c",burnt:"#603a39",sea:"#50617A",sky:"#2D85A8",night:"#303b50",rouge:"#914045",grey:"#838B91",mud:"#C4ABAB",royal:"#275291",cherry:"#cc6966",tulip:"#e6b3bc",rose:"#D68881",fire:"#AB5850",greyblue:"#72697D",greygreen:"#8BA3A2",greypurple:"#978BA3",burn:"#6D5685",slategrey:"#bfb0b3",light:"#a3a5a5",lighter:"#d7d5d2",fudge:"#4d4d4d",lightgrey:"#949a9e",white:"#fbfbfb",dimgrey:"#606c74",softblack:"#463D4F",dark:"#443d3d",black:"#333333"};},{}],2:[function(e,r,o){var n=e("./colors"),t={juno:["blue","mud","navy","slate","pink","burn"],barrow:["rouge","red","orange","burnt","brown","greygreen"],roma:["#8a849a","#b5b0bf","rose","lighter","greygreen","mud"],palmer:["red","navy","olive","pink","suede","sky"],mark:["#848f9a","#9aa4ac","slate","#b0b8bf","mud","grey"],salmon:["sky","sea","fuscia","slate","mud","fudge"],dupont:["green","brown","orange","red","olive","blue"],bloor:["night","navy","beige","rouge","mud","grey"],yukon:["mud","slate","brown","sky","beige","red"],david:["blue","green","yellow","red","pink","light"],neste:["mud","cherry","royal","rouge","greygreen","greypurple"],ken:["red","sky","#c67a53","greygreen","#dfb59f","mud"]};Object.keys(t).forEach(function(e){t[e]=t[e].map(function(e){return n[e]||e});}),r.exports=t;},{"./colors":1}],3:[function(e,r,o){var n=e("./colors"),t=e("./combos"),u={colors:n,list:Object.keys(n).map(function(e){return n[e]}),combos:t};r.exports=u;},{"./colors":1,"./combos":2}]},{},[3])(3)});
    });

    /* Users/spencer/mountain/somehow-sankey/src/Sankey.svelte generated by Svelte v3.29.0 */

    const { console: console_1 } = globals;
    const file$3 = "Users/spencer/mountain/somehow-sankey/src/Sankey.svelte";

    function add_css$2() {
    	var style = element$1("style");
    	style.id = "svelte-7h5ydy-style";
    	style.textContent = ".flip.svelte-7h5ydy{-webkit-transform:scaleX(-1);transform:scale(-1, 3.1)}.brace.svelte-7h5ydy{width:2em;height:3em}.brace_part1.svelte-7h5ydy{border-left:2px solid lightgrey;border-top-left-radius:12px;margin-left:2em}.brace_part2.svelte-7h5ydy{border-right:2px solid lightgrey;border-bottom-right-radius:12px}.brace_part3.svelte-7h5ydy{border-right:2px solid lightgrey;border-top-right-radius:12px}.brace_part4.svelte-7h5ydy{border-left:2px solid lightgrey;border-bottom-left-radius:12px;margin-left:2em}.myLabel.svelte-7h5ydy{position:absolute;flex-shrink:1;max-width:60px;margin-left:25px;color:grey;text-align:left;padding-left:1rem;font-size:11px;line-height:18px}.node.svelte-7h5ydy{position:absolute;border-radius:3px;box-shadow:2px 2px 8px 0px rgba(0, 0, 0, 0.2);color:#dedede;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;border-bottom:4px solid #d98b89;font-size:15px;font-family:'Catamaran', sans-serif;transition:box-shadow 0.2s ease-in-out;box-shadow:1px 2px 8px 0px grey}.node.svelte-7h5ydy:hover{box-shadow:2px 2px 8px 0px steelblue}.link.svelte-7h5ydy{opacity:0.2;z-index:1}.link.svelte-7h5ydy:hover{stroke-opacity:1}.value.svelte-7h5ydy{font-size:20px;font-weight:100;z-index:2;cursor:default}.label.svelte-7h5ydy{z-index:2;cursor:default;line-height:1rem}.inline.svelte-7h5ydy{flex-direction:row;justify-content:space-evenly}.tiny.svelte-7h5ydy{z-index:2;font-size:10px !important;line-height:11px}.drop.svelte-7h5ydy{position:absolute;top:0px;z-index:1;border-radius:3px}.dots.svelte-7h5ydy{position:absolute;top:0px;height:100%;width:100%;z-index:0}.append.svelte-7h5ydy{position:absolute;bottom:-30px;font-size:12px}.after.svelte-7h5ydy{display:none}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2Fua2V5LnN2ZWx0ZSIsInNvdXJjZXMiOlsiU2Fua2V5LnN2ZWx0ZSJdLCJzb3VyY2VzQ29udGVudCI6WyI8c2NyaXB0PlxuICBpbXBvcnQgbGF5b3V0IGZyb20gJy4vbGF5b3V0J1xuICBpbXBvcnQgRG90cyBmcm9tICcuL0RvdHMuc3ZlbHRlJ1xuICBpbXBvcnQgeyBpdGVtcywgbGFiZWxzIH0gZnJvbSAnLi9saWIvc3RvcmUuanMnXG4gIGltcG9ydCB7IG9uTW91bnQgfSBmcm9tICdzdmVsdGUnXG4gIGltcG9ydCBjIGZyb20gJ3NwZW5jZXItY29sb3InXG4gIGxldCBjb2xvcnMgPSBjLmNvbG9yc1xuICBleHBvcnQgbGV0IGhlaWdodCA9IDUwMFxuICBleHBvcnQgbGV0IG5vZGVXaWR0aCA9IDEyMFxuICBsZXQgd2lkdGggPSA1MDAgLy90aGlzIGdldHMgcmUtc2V0XG4gIGV4cG9ydCBsZXQgZm10ID0gKG51bSkgPT4ge1xuICAgIGlmIChudW0gPj0gMTAwMDAwMCkge1xuICAgICAgbnVtID0gTWF0aC5yb3VuZChudW0gLyAxMDAwMDAwKSAqIDEwMDAwMDBcbiAgICAgIHJldHVybiBTdHJpbmcobnVtIC8gMTAwMDAwMCkgKyAnbSdcbiAgICB9XG4gICAgaWYgKG51bSA+IDEwMDApIHtcbiAgICAgIHJldHVybiBTdHJpbmcobnVtIC8gMTAwMCkgKyAnaydcbiAgICB9XG4gICAgcmV0dXJuIFN0cmluZyhudW0pXG4gIH1cbiAgaGVpZ2h0ID0gTnVtYmVyKGhlaWdodClcbiAgd2lkdGggPSBOdW1iZXIod2lkdGgpXG4gIGxldCBub2RlcyA9IFtdXG4gIGxldCBwYXRocyA9IFtdXG4gIGxldCBvdXJMYWJlbHMgPSBbXVxuICBsZXQgY29sb3IgPSAnc3RlZWxibHVlJ1xuICBsZXQgYWNjZW50ID0gJyNkOThiODknXG4gIG9uTW91bnQoKCkgPT4ge1xuICAgIGxldCByZXMgPSBsYXlvdXQoJGl0ZW1zLCB3aWR0aCwgaGVpZ2h0LCBub2RlV2lkdGgsICRsYWJlbHMpXG4gICAgY29uc29sZS5sb2cocmVzKVxuICAgIG5vZGVzID0gcmVzLm5vZGVzXG4gICAgcGF0aHMgPSByZXMucGF0aHNcbiAgICBvdXJMYWJlbHMgPSByZXMubGFiZWxzXG4gIH0pXG48L3NjcmlwdD5cblxuPGRpdiBzdHlsZT1cInBvc2l0aW9uOnJlbGF0aXZlO1wiIGJpbmQ6Y2xpZW50V2lkdGg9e3dpZHRofT5cbiAgPGRpdiBzdHlsZT1cInBvc2l0aW9uOmFic29sdXRlOyB3aWR0aDp7d2lkdGh9cHg7IGhlaWdodDp7aGVpZ2h0fXB4O1wiPlxuICAgIHsjZWFjaCBub2RlcyBhcyBkfVxuICAgICAgPGRpdlxuICAgICAgICBjbGFzcz1cIm5vZGVcIlxuICAgICAgICBjbGFzczp0aW55PXtkLmhlaWdodCA8IDc1fVxuICAgICAgICBjbGFzczppbmxpbmU9e2QuaW5saW5lfVxuICAgICAgICB0aXRsZT17ZC5uYW1lfVxuICAgICAgICBzdHlsZT1cImxlZnQ6e2QueH1weDsgdG9wOntkLnl9cHg7IHdpZHRoOntkLndpZHRofXB4OyBoZWlnaHQ6e2QuaGVpZ2h0fXB4OyAgICAgIFxuICAgICAgICBvcGFjaXR5OntkLm9wYWNpdHkgfHwgMX07XCJcbiAgICAgID5cbiAgICAgICAgPGRpdlxuICAgICAgICAgIGNsYXNzPVwiZHJvcFwiXG4gICAgICAgICAgc3R5bGU9XCJ3aWR0aDoxMDAlOyBoZWlnaHQ6e2QuZnVsbH0lOyBiYWNrZ3JvdW5kLWNvbG9yOntkLmNvbG9yIHx8XG4gICAgICAgICAgICBjb2xvcn07IGJvcmRlci1ib3R0b206IDRweCBzb2xpZCB7ZC5hY2NlbnQgfHwgYWNjZW50fTtcIlxuICAgICAgICAvPlxuXG4gICAgICAgIHsjaWYgZC5mdWxsICE9PSAxMDB9XG4gICAgICAgICAgPGRpdiBjbGFzcz1cImRvdHNcIiBzdHlsZT1cImJhY2tncm91bmQtY29sb3I6IHtkLmNvbG9yIHx8IGNvbG9yfTtcIj5cbiAgICAgICAgICAgIDxEb3RzIGNvbG9yPXsnd2hpdGUnfSAvPlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICB7L2lmfVxuICAgICAgICA8ZGl2IGNsYXNzPVwibGFiZWxcIiBjbGFzczphZnRlcj17ZC5hZnRlcn0+XG4gICAgICAgICAge2QubmFtZX1cbiAgICAgICAgPC9kaXY+XG4gICAgICAgIHsjaWYgZC5zaG93X251bX1cbiAgICAgICAgICA8ZGl2XG4gICAgICAgICAgICBjbGFzcz1cInZhbHVlXCJcbiAgICAgICAgICAgIGNsYXNzOnRpbnk9e2QuaGVpZ2h0IDwgNzV9XG4gICAgICAgICAgICBzdHlsZT1cImNvbG9yOntkLnN0cm9rZX07XCJcbiAgICAgICAgICA+XG4gICAgICAgICAgICB7Zm10KGQudmFsdWUpfVxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICB7L2lmfVxuICAgICAgICB7I2lmIGQuc2hvd19wZXJjZW50fVxuICAgICAgICAgIDxkaXZcbiAgICAgICAgICAgIGNsYXNzPVwidmFsdWVcIlxuICAgICAgICAgICAgY2xhc3M6dGlueT17ZC5oZWlnaHQgPCA3NX1cbiAgICAgICAgICAgIHN0eWxlPVwiY29sb3I6e2Quc3Ryb2tlfTsgb3BhY2l0eTowLjg7XCJcbiAgICAgICAgICA+XG4gICAgICAgICAgICB7ZC5wZXJjZW50fVxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICB7L2lmfVxuICAgICAgICB7I2lmIGQuYXBwZW5kfVxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJhcHBlbmRcIiBzdHlsZT1cImNvbG9yOntkLmNvbG9yIHx8IGNvbG9yfVwiPlxuICAgICAgICAgICAge2QuYXBwZW5kfVxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICB7L2lmfVxuICAgICAgPC9kaXY+XG4gICAgey9lYWNofVxuXG4gICAgeyNlYWNoIG91ckxhYmVscyBhcyBkfVxuICAgICAgPGRpdlxuICAgICAgICBjbGFzcz1cIm15TGFiZWwgcm93XCJcbiAgICAgICAgc3R5bGU9XCJsZWZ0OntkLnh9cHg7IHRvcDp7ZC55fXB4OyBoZWlnaHQ6e2QuZW5kIC1cbiAgICAgICAgICBkLnN0YXJ0fXB4OyB3aWR0aDp7ZC53aWR0aH1weDsgaGVpZ2h0OntkLmhlaWdodH1weDsgICAgICBcbiAgICBvcGFjaXR5OntkLm9wYWNpdHkgfHwgMX07XCJcbiAgICAgID5cbiAgICAgICAgPGRpdiBjbGFzcz1cImZsaXBcIiBzdHlsZT1cInBvc2l0aW9uOnJlbGF0aXZlO1wiPlxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJicmFjZSBicmFjZV9wYXJ0MVwiIC8+XG4gICAgICAgICAgPGRpdiBjbGFzcz1cImJyYWNlIGJyYWNlX3BhcnQyXCIgLz5cbiAgICAgICAgICA8ZGl2IGNsYXNzPVwiYnJhY2UgYnJhY2VfcGFydDNcIiAvPlxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJicmFjZSBicmFjZV9wYXJ0NFwiIC8+XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8ZGl2PlxuICAgICAgICAgIHtAaHRtbCBkLmxhYmVsfVxuICAgICAgICA8L2Rpdj5cbiAgICAgIDwvZGl2PlxuICAgIHsvZWFjaH1cbiAgPC9kaXY+XG5cbiAgPHN2ZyB2aWV3Qm94PVwiMCwwLHt3aWR0aH0se2hlaWdodH1cIiB7d2lkdGh9IHtoZWlnaHR9PlxuICAgIHsjZWFjaCBwYXRocyBhcyBkfVxuICAgICAgPHBhdGhcbiAgICAgICAgY2xhc3M9XCJsaW5rXCJcbiAgICAgICAge2R9XG4gICAgICAgIHN0cm9rZT1cIm5vbmVcIlxuICAgICAgICBmaWxsPVwibGlnaHRzdGVlbGJsdWVcIlxuICAgICAgICBzdHlsZT1cIlwiXG4gICAgICAgIHN0cm9rZS13aWR0aD17MX1cbiAgICAgIC8+XG4gICAgey9lYWNofVxuICA8L3N2Zz5cbjwvZGl2PlxuXG48c2xvdCAvPlxuXG48c3R5bGU+XG4gIC5mbGlwIHtcbiAgICAtd2Via2l0LXRyYW5zZm9ybTogc2NhbGVYKC0xKTtcbiAgICB0cmFuc2Zvcm06IHNjYWxlKC0xLCAzLjEpO1xuICB9XG4gIC5icmFjZSB7XG4gICAgd2lkdGg6IDJlbTtcbiAgICBoZWlnaHQ6IDNlbTtcbiAgfVxuICAuYnJhY2VfcGFydDEge1xuICAgIGJvcmRlci1sZWZ0OiAycHggc29saWQgbGlnaHRncmV5O1xuICAgIGJvcmRlci10b3AtbGVmdC1yYWRpdXM6IDEycHg7XG4gICAgbWFyZ2luLWxlZnQ6IDJlbTtcbiAgfVxuICAuYnJhY2VfcGFydDIge1xuICAgIGJvcmRlci1yaWdodDogMnB4IHNvbGlkIGxpZ2h0Z3JleTtcbiAgICBib3JkZXItYm90dG9tLXJpZ2h0LXJhZGl1czogMTJweDtcbiAgfVxuICAuYnJhY2VfcGFydDMge1xuICAgIGJvcmRlci1yaWdodDogMnB4IHNvbGlkIGxpZ2h0Z3JleTtcbiAgICBib3JkZXItdG9wLXJpZ2h0LXJhZGl1czogMTJweDtcbiAgfVxuICAuYnJhY2VfcGFydDQge1xuICAgIGJvcmRlci1sZWZ0OiAycHggc29saWQgbGlnaHRncmV5O1xuICAgIGJvcmRlci1ib3R0b20tbGVmdC1yYWRpdXM6IDEycHg7XG4gICAgbWFyZ2luLWxlZnQ6IDJlbTtcbiAgfVxuICAubXlMYWJlbCB7XG4gICAgcG9zaXRpb246IGFic29sdXRlO1xuICAgIGZsZXgtc2hyaW5rOiAxO1xuICAgIG1heC13aWR0aDogNjBweDtcbiAgICAvKiBtYXgtd2lkdGg6IDc1cHg7ICovXG4gICAgLyogbWluLXdpZHRoOiAxNzVweDsgKi9cbiAgICBtYXJnaW4tbGVmdDogMjVweDtcbiAgICAvKiBib3JkZXItbGVmdDogM3B4IHNvbGlkIGxpZ2h0Z3JleTsgKi9cbiAgICBjb2xvcjogZ3JleTtcbiAgICB0ZXh0LWFsaWduOiBsZWZ0O1xuICAgIHBhZGRpbmctbGVmdDogMXJlbTtcbiAgICBmb250LXNpemU6IDExcHg7XG4gICAgbGluZS1oZWlnaHQ6IDE4cHg7XG4gIH1cbiAgLm5vZGUge1xuICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgICBib3JkZXItcmFkaXVzOiAzcHg7XG4gICAgYm94LXNoYWRvdzogMnB4IDJweCA4cHggMHB4IHJnYmEoMCwgMCwgMCwgMC4yKTtcbiAgICBjb2xvcjogI2RlZGVkZTtcbiAgICB0ZXh0LWFsaWduOiBjZW50ZXI7XG4gICAgZGlzcGxheTogZmxleDtcbiAgICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7XG4gICAgYm9yZGVyLWJvdHRvbTogNHB4IHNvbGlkICNkOThiODk7XG4gICAgZm9udC1zaXplOiAxNXB4O1xuICAgIGZvbnQtZmFtaWx5OiAnQ2F0YW1hcmFuJywgc2Fucy1zZXJpZjtcbiAgICB0cmFuc2l0aW9uOiBib3gtc2hhZG93IDAuMnMgZWFzZS1pbi1vdXQ7XG4gICAgYm94LXNoYWRvdzogMXB4IDJweCA4cHggMHB4IGdyZXk7XG4gIH1cbiAgLm5vZGU6aG92ZXIge1xuICAgIGJveC1zaGFkb3c6IDJweCAycHggOHB4IDBweCBzdGVlbGJsdWU7XG4gIH1cbiAgLmxpbmsge1xuICAgIG9wYWNpdHk6IDAuMjtcbiAgICB6LWluZGV4OiAxO1xuICB9XG4gIC5saW5rOmhvdmVyIHtcbiAgICBzdHJva2Utb3BhY2l0eTogMTtcbiAgfVxuICAudmFsdWUge1xuICAgIGZvbnQtc2l6ZTogMjBweDtcbiAgICBmb250LXdlaWdodDogMTAwO1xuICAgIHotaW5kZXg6IDI7XG4gICAgY3Vyc29yOiBkZWZhdWx0O1xuICB9XG4gIC5sYWJlbCB7XG4gICAgei1pbmRleDogMjtcbiAgICBjdXJzb3I6IGRlZmF1bHQ7XG4gICAgbGluZS1oZWlnaHQ6IDFyZW07XG4gIH1cbiAgLmlubGluZSB7XG4gICAgZmxleC1kaXJlY3Rpb246IHJvdztcbiAgICBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWV2ZW5seTtcbiAgfVxuICAudGlueSB7XG4gICAgei1pbmRleDogMjtcbiAgICBmb250LXNpemU6IDEwcHggIWltcG9ydGFudDtcbiAgICBsaW5lLWhlaWdodDogMTFweDtcbiAgfVxuICAuZHJvcCB7XG4gICAgcG9zaXRpb246IGFic29sdXRlO1xuICAgIHRvcDogMHB4O1xuICAgIHotaW5kZXg6IDE7XG4gICAgYm9yZGVyLXJhZGl1czogM3B4O1xuICB9XG4gIC5kb3RzIHtcbiAgICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gICAgdG9wOiAwcHg7XG4gICAgaGVpZ2h0OiAxMDAlO1xuICAgIHdpZHRoOiAxMDAlO1xuICAgIHotaW5kZXg6IDA7XG4gIH1cbiAgLmFwcGVuZCB7XG4gICAgcG9zaXRpb246IGFic29sdXRlO1xuICAgIGJvdHRvbTogLTMwcHg7XG4gICAgZm9udC1zaXplOiAxMnB4O1xuICB9XG4gIC5hZnRlciB7XG4gICAgZGlzcGxheTogbm9uZTtcbiAgICAvKiBwb3NpdGlvbjogcmVsYXRpdmU7XG4gICAgbGVmdDogMTUwcHg7XG4gICAgY29sb3I6IGdyZXk7XG4gICAgd2hpdGUtc3BhY2U6IG5vd3JhcDtcbiAgICB0ZXh0LWFsaWduOiBsZWZ0OyAqL1xuICB9XG48L3N0eWxlPlxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQTRIRSxLQUFLLGNBQUMsQ0FBQyxBQUNMLGlCQUFpQixDQUFFLE9BQU8sRUFBRSxDQUFDLENBQzdCLFNBQVMsQ0FBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxBQUMzQixDQUFDLEFBQ0QsTUFBTSxjQUFDLENBQUMsQUFDTixLQUFLLENBQUUsR0FBRyxDQUNWLE1BQU0sQ0FBRSxHQUFHLEFBQ2IsQ0FBQyxBQUNELFlBQVksY0FBQyxDQUFDLEFBQ1osV0FBVyxDQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUNoQyxzQkFBc0IsQ0FBRSxJQUFJLENBQzVCLFdBQVcsQ0FBRSxHQUFHLEFBQ2xCLENBQUMsQUFDRCxZQUFZLGNBQUMsQ0FBQyxBQUNaLFlBQVksQ0FBRSxHQUFHLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FDakMsMEJBQTBCLENBQUUsSUFBSSxBQUNsQyxDQUFDLEFBQ0QsWUFBWSxjQUFDLENBQUMsQUFDWixZQUFZLENBQUUsR0FBRyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQ2pDLHVCQUF1QixDQUFFLElBQUksQUFDL0IsQ0FBQyxBQUNELFlBQVksY0FBQyxDQUFDLEFBQ1osV0FBVyxDQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUNoQyx5QkFBeUIsQ0FBRSxJQUFJLENBQy9CLFdBQVcsQ0FBRSxHQUFHLEFBQ2xCLENBQUMsQUFDRCxRQUFRLGNBQUMsQ0FBQyxBQUNSLFFBQVEsQ0FBRSxRQUFRLENBQ2xCLFdBQVcsQ0FBRSxDQUFDLENBQ2QsU0FBUyxDQUFFLElBQUksQ0FHZixXQUFXLENBQUUsSUFBSSxDQUVqQixLQUFLLENBQUUsSUFBSSxDQUNYLFVBQVUsQ0FBRSxJQUFJLENBQ2hCLFlBQVksQ0FBRSxJQUFJLENBQ2xCLFNBQVMsQ0FBRSxJQUFJLENBQ2YsV0FBVyxDQUFFLElBQUksQUFDbkIsQ0FBQyxBQUNELEtBQUssY0FBQyxDQUFDLEFBQ0wsUUFBUSxDQUFFLFFBQVEsQ0FDbEIsYUFBYSxDQUFFLEdBQUcsQ0FDbEIsVUFBVSxDQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUM5QyxLQUFLLENBQUUsT0FBTyxDQUNkLFVBQVUsQ0FBRSxNQUFNLENBQ2xCLE9BQU8sQ0FBRSxJQUFJLENBQ2IsY0FBYyxDQUFFLE1BQU0sQ0FDdEIsV0FBVyxDQUFFLE1BQU0sQ0FDbkIsZUFBZSxDQUFFLE1BQU0sQ0FDdkIsYUFBYSxDQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUNoQyxTQUFTLENBQUUsSUFBSSxDQUNmLFdBQVcsQ0FBRSxXQUFXLENBQUMsQ0FBQyxVQUFVLENBQ3BDLFVBQVUsQ0FBRSxVQUFVLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FDdkMsVUFBVSxDQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEFBQ2xDLENBQUMsQUFDRCxtQkFBSyxNQUFNLEFBQUMsQ0FBQyxBQUNYLFVBQVUsQ0FBRSxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsU0FBUyxBQUN2QyxDQUFDLEFBQ0QsS0FBSyxjQUFDLENBQUMsQUFDTCxPQUFPLENBQUUsR0FBRyxDQUNaLE9BQU8sQ0FBRSxDQUFDLEFBQ1osQ0FBQyxBQUNELG1CQUFLLE1BQU0sQUFBQyxDQUFDLEFBQ1gsY0FBYyxDQUFFLENBQUMsQUFDbkIsQ0FBQyxBQUNELE1BQU0sY0FBQyxDQUFDLEFBQ04sU0FBUyxDQUFFLElBQUksQ0FDZixXQUFXLENBQUUsR0FBRyxDQUNoQixPQUFPLENBQUUsQ0FBQyxDQUNWLE1BQU0sQ0FBRSxPQUFPLEFBQ2pCLENBQUMsQUFDRCxNQUFNLGNBQUMsQ0FBQyxBQUNOLE9BQU8sQ0FBRSxDQUFDLENBQ1YsTUFBTSxDQUFFLE9BQU8sQ0FDZixXQUFXLENBQUUsSUFBSSxBQUNuQixDQUFDLEFBQ0QsT0FBTyxjQUFDLENBQUMsQUFDUCxjQUFjLENBQUUsR0FBRyxDQUNuQixlQUFlLENBQUUsWUFBWSxBQUMvQixDQUFDLEFBQ0QsS0FBSyxjQUFDLENBQUMsQUFDTCxPQUFPLENBQUUsQ0FBQyxDQUNWLFNBQVMsQ0FBRSxJQUFJLENBQUMsVUFBVSxDQUMxQixXQUFXLENBQUUsSUFBSSxBQUNuQixDQUFDLEFBQ0QsS0FBSyxjQUFDLENBQUMsQUFDTCxRQUFRLENBQUUsUUFBUSxDQUNsQixHQUFHLENBQUUsR0FBRyxDQUNSLE9BQU8sQ0FBRSxDQUFDLENBQ1YsYUFBYSxDQUFFLEdBQUcsQUFDcEIsQ0FBQyxBQUNELEtBQUssY0FBQyxDQUFDLEFBQ0wsUUFBUSxDQUFFLFFBQVEsQ0FDbEIsR0FBRyxDQUFFLEdBQUcsQ0FDUixNQUFNLENBQUUsSUFBSSxDQUNaLEtBQUssQ0FBRSxJQUFJLENBQ1gsT0FBTyxDQUFFLENBQUMsQUFDWixDQUFDLEFBQ0QsT0FBTyxjQUFDLENBQUMsQUFDUCxRQUFRLENBQUUsUUFBUSxDQUNsQixNQUFNLENBQUUsS0FBSyxDQUNiLFNBQVMsQ0FBRSxJQUFJLEFBQ2pCLENBQUMsQUFDRCxNQUFNLGNBQUMsQ0FBQyxBQUNOLE9BQU8sQ0FBRSxJQUFJLEFBTWYsQ0FBQyJ9 */";
    	append_dev$1(document.head, style);
    }

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[15] = list[i];
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[15] = list[i];
    	return child_ctx;
    }

    function get_each_context_2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[15] = list[i];
    	return child_ctx;
    }

    // (54:8) {#if d.full !== 100}
    function create_if_block_3(ctx) {
    	let div;
    	let dots;
    	let current;

    	dots = new Dots({
    			props: { color: "white" },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			div = element$1("div");
    			create_component$1(dots.$$.fragment);
    			attr_dev$1(div, "class", "dots svelte-7h5ydy");
    			set_style(div, "background-color", /*d*/ ctx[15].color || /*color*/ ctx[6]);
    			add_location$1(div, file$3, 54, 10, 1534);
    		},
    		m: function mount(target, anchor) {
    			insert_dev$1(target, div, anchor);
    			mount_component$1(dots, div, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (!current || dirty & /*nodes*/ 8) {
    				set_style(div, "background-color", /*d*/ ctx[15].color || /*color*/ ctx[6]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in$1(dots.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out$1(dots.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev$1(div);
    			destroy_component$1(dots);
    		}
    	};

    	dispatch_dev$1("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3.name,
    		type: "if",
    		source: "(54:8) {#if d.full !== 100}",
    		ctx
    	});

    	return block;
    }

    // (62:8) {#if d.show_num}
    function create_if_block_2(ctx) {
    	let div;
    	let t_value = /*fmt*/ ctx[1](/*d*/ ctx[15].value) + "";
    	let t;

    	const block = {
    		c: function create() {
    			div = element$1("div");
    			t = text$1(t_value);
    			attr_dev$1(div, "class", "value svelte-7h5ydy");
    			set_style(div, "color", /*d*/ ctx[15].stroke);
    			toggle_class(div, "tiny", /*d*/ ctx[15].height < 75);
    			add_location$1(div, file$3, 62, 10, 1786);
    		},
    		m: function mount(target, anchor) {
    			insert_dev$1(target, div, anchor);
    			append_dev$1(div, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*fmt, nodes*/ 10 && t_value !== (t_value = /*fmt*/ ctx[1](/*d*/ ctx[15].value) + "")) set_data_dev$1(t, t_value);

    			if (dirty & /*nodes*/ 8) {
    				set_style(div, "color", /*d*/ ctx[15].stroke);
    			}

    			if (dirty & /*nodes*/ 8) {
    				toggle_class(div, "tiny", /*d*/ ctx[15].height < 75);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev$1(div);
    		}
    	};

    	dispatch_dev$1("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2.name,
    		type: "if",
    		source: "(62:8) {#if d.show_num}",
    		ctx
    	});

    	return block;
    }

    // (71:8) {#if d.show_percent}
    function create_if_block_1(ctx) {
    	let div;
    	let t_value = /*d*/ ctx[15].percent + "";
    	let t;

    	const block = {
    		c: function create() {
    			div = element$1("div");
    			t = text$1(t_value);
    			attr_dev$1(div, "class", "value svelte-7h5ydy");
    			set_style(div, "color", /*d*/ ctx[15].stroke);
    			set_style(div, "opacity", "0.8");
    			toggle_class(div, "tiny", /*d*/ ctx[15].height < 75);
    			add_location$1(div, file$3, 71, 10, 2003);
    		},
    		m: function mount(target, anchor) {
    			insert_dev$1(target, div, anchor);
    			append_dev$1(div, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*nodes*/ 8 && t_value !== (t_value = /*d*/ ctx[15].percent + "")) set_data_dev$1(t, t_value);

    			if (dirty & /*nodes*/ 8) {
    				set_style(div, "color", /*d*/ ctx[15].stroke);
    			}

    			if (dirty & /*nodes*/ 8) {
    				toggle_class(div, "tiny", /*d*/ ctx[15].height < 75);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev$1(div);
    		}
    	};

    	dispatch_dev$1("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(71:8) {#if d.show_percent}",
    		ctx
    	});

    	return block;
    }

    // (80:8) {#if d.append}
    function create_if_block$2(ctx) {
    	let div;
    	let t_value = /*d*/ ctx[15].append + "";
    	let t;

    	const block = {
    		c: function create() {
    			div = element$1("div");
    			t = text$1(t_value);
    			attr_dev$1(div, "class", "append svelte-7h5ydy");
    			set_style(div, "color", /*d*/ ctx[15].color || /*color*/ ctx[6]);
    			add_location$1(div, file$3, 80, 10, 2224);
    		},
    		m: function mount(target, anchor) {
    			insert_dev$1(target, div, anchor);
    			append_dev$1(div, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*nodes*/ 8 && t_value !== (t_value = /*d*/ ctx[15].append + "")) set_data_dev$1(t, t_value);

    			if (dirty & /*nodes*/ 8) {
    				set_style(div, "color", /*d*/ ctx[15].color || /*color*/ ctx[6]);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev$1(div);
    		}
    	};

    	dispatch_dev$1("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$2.name,
    		type: "if",
    		source: "(80:8) {#if d.append}",
    		ctx
    	});

    	return block;
    }

    // (39:4) {#each nodes as d}
    function create_each_block_2(ctx) {
    	let div2;
    	let div0;
    	let t0;
    	let t1;
    	let div1;
    	let t2_value = /*d*/ ctx[15].name + "";
    	let t2;
    	let t3;
    	let t4;
    	let t5;
    	let div2_title_value;
    	let current;
    	let if_block0 = /*d*/ ctx[15].full !== 100 && create_if_block_3(ctx);
    	let if_block1 = /*d*/ ctx[15].show_num && create_if_block_2(ctx);
    	let if_block2 = /*d*/ ctx[15].show_percent && create_if_block_1(ctx);
    	let if_block3 = /*d*/ ctx[15].append && create_if_block$2(ctx);

    	const block = {
    		c: function create() {
    			div2 = element$1("div");
    			div0 = element$1("div");
    			t0 = space$1();
    			if (if_block0) if_block0.c();
    			t1 = space$1();
    			div1 = element$1("div");
    			t2 = text$1(t2_value);
    			t3 = space$1();
    			if (if_block1) if_block1.c();
    			t4 = space$1();
    			if (if_block2) if_block2.c();
    			t5 = space$1();
    			if (if_block3) if_block3.c();
    			attr_dev$1(div0, "class", "drop svelte-7h5ydy");
    			set_style(div0, "width", "100%");
    			set_style(div0, "height", /*d*/ ctx[15].full + "%");
    			set_style(div0, "background-color", /*d*/ ctx[15].color || /*color*/ ctx[6]);
    			set_style(div0, "border-bottom", "4px solid " + (/*d*/ ctx[15].accent || /*accent*/ ctx[7]));
    			add_location$1(div0, file$3, 47, 8, 1311);
    			attr_dev$1(div1, "class", "label svelte-7h5ydy");
    			toggle_class(div1, "after", /*d*/ ctx[15].after);
    			add_location$1(div1, file$3, 58, 8, 1675);
    			attr_dev$1(div2, "class", "node svelte-7h5ydy");
    			attr_dev$1(div2, "title", div2_title_value = /*d*/ ctx[15].name);
    			set_style(div2, "left", /*d*/ ctx[15].x + "px");
    			set_style(div2, "top", /*d*/ ctx[15].y + "px");
    			set_style(div2, "width", /*d*/ ctx[15].width + "px");
    			set_style(div2, "height", /*d*/ ctx[15].height + "px");
    			set_style(div2, "opacity", /*d*/ ctx[15].opacity || 1);
    			toggle_class(div2, "tiny", /*d*/ ctx[15].height < 75);
    			toggle_class(div2, "inline", /*d*/ ctx[15].inline);
    			add_location$1(div2, file$3, 39, 6, 1056);
    		},
    		m: function mount(target, anchor) {
    			insert_dev$1(target, div2, anchor);
    			append_dev$1(div2, div0);
    			append_dev$1(div2, t0);
    			if (if_block0) if_block0.m(div2, null);
    			append_dev$1(div2, t1);
    			append_dev$1(div2, div1);
    			append_dev$1(div1, t2);
    			append_dev$1(div2, t3);
    			if (if_block1) if_block1.m(div2, null);
    			append_dev$1(div2, t4);
    			if (if_block2) if_block2.m(div2, null);
    			append_dev$1(div2, t5);
    			if (if_block3) if_block3.m(div2, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (!current || dirty & /*nodes*/ 8) {
    				set_style(div0, "height", /*d*/ ctx[15].full + "%");
    			}

    			if (!current || dirty & /*nodes*/ 8) {
    				set_style(div0, "background-color", /*d*/ ctx[15].color || /*color*/ ctx[6]);
    			}

    			if (!current || dirty & /*nodes*/ 8) {
    				set_style(div0, "border-bottom", "4px solid " + (/*d*/ ctx[15].accent || /*accent*/ ctx[7]));
    			}

    			if (/*d*/ ctx[15].full !== 100) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty & /*nodes*/ 8) {
    						transition_in$1(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_3(ctx);
    					if_block0.c();
    					transition_in$1(if_block0, 1);
    					if_block0.m(div2, t1);
    				}
    			} else if (if_block0) {
    				group_outros$1();

    				transition_out$1(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros$1();
    			}

    			if ((!current || dirty & /*nodes*/ 8) && t2_value !== (t2_value = /*d*/ ctx[15].name + "")) set_data_dev$1(t2, t2_value);

    			if (dirty & /*nodes*/ 8) {
    				toggle_class(div1, "after", /*d*/ ctx[15].after);
    			}

    			if (/*d*/ ctx[15].show_num) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_2(ctx);
    					if_block1.c();
    					if_block1.m(div2, t4);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (/*d*/ ctx[15].show_percent) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);
    				} else {
    					if_block2 = create_if_block_1(ctx);
    					if_block2.c();
    					if_block2.m(div2, t5);
    				}
    			} else if (if_block2) {
    				if_block2.d(1);
    				if_block2 = null;
    			}

    			if (/*d*/ ctx[15].append) {
    				if (if_block3) {
    					if_block3.p(ctx, dirty);
    				} else {
    					if_block3 = create_if_block$2(ctx);
    					if_block3.c();
    					if_block3.m(div2, null);
    				}
    			} else if (if_block3) {
    				if_block3.d(1);
    				if_block3 = null;
    			}

    			if (!current || dirty & /*nodes*/ 8 && div2_title_value !== (div2_title_value = /*d*/ ctx[15].name)) {
    				attr_dev$1(div2, "title", div2_title_value);
    			}

    			if (!current || dirty & /*nodes*/ 8) {
    				set_style(div2, "left", /*d*/ ctx[15].x + "px");
    			}

    			if (!current || dirty & /*nodes*/ 8) {
    				set_style(div2, "top", /*d*/ ctx[15].y + "px");
    			}

    			if (!current || dirty & /*nodes*/ 8) {
    				set_style(div2, "width", /*d*/ ctx[15].width + "px");
    			}

    			if (!current || dirty & /*nodes*/ 8) {
    				set_style(div2, "height", /*d*/ ctx[15].height + "px");
    			}

    			if (!current || dirty & /*nodes*/ 8) {
    				set_style(div2, "opacity", /*d*/ ctx[15].opacity || 1);
    			}

    			if (dirty & /*nodes*/ 8) {
    				toggle_class(div2, "tiny", /*d*/ ctx[15].height < 75);
    			}

    			if (dirty & /*nodes*/ 8) {
    				toggle_class(div2, "inline", /*d*/ ctx[15].inline);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in$1(if_block0);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out$1(if_block0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev$1(div2);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    			if (if_block3) if_block3.d();
    		}
    	};

    	dispatch_dev$1("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_2.name,
    		type: "each",
    		source: "(39:4) {#each nodes as d}",
    		ctx
    	});

    	return block;
    }

    // (88:4) {#each ourLabels as d}
    function create_each_block_1(ctx) {
    	let div6;
    	let div4;
    	let div0;
    	let t0;
    	let div1;
    	let t1;
    	let div2;
    	let t2;
    	let div3;
    	let t3;
    	let div5;
    	let raw_value = /*d*/ ctx[15].label + "";
    	let t4;

    	const block = {
    		c: function create() {
    			div6 = element$1("div");
    			div4 = element$1("div");
    			div0 = element$1("div");
    			t0 = space$1();
    			div1 = element$1("div");
    			t1 = space$1();
    			div2 = element$1("div");
    			t2 = space$1();
    			div3 = element$1("div");
    			t3 = space$1();
    			div5 = element$1("div");
    			t4 = space$1();
    			attr_dev$1(div0, "class", "brace brace_part1 svelte-7h5ydy");
    			add_location$1(div0, file$3, 95, 10, 2653);
    			attr_dev$1(div1, "class", "brace brace_part2 svelte-7h5ydy");
    			add_location$1(div1, file$3, 96, 10, 2697);
    			attr_dev$1(div2, "class", "brace brace_part3 svelte-7h5ydy");
    			add_location$1(div2, file$3, 97, 10, 2741);
    			attr_dev$1(div3, "class", "brace brace_part4 svelte-7h5ydy");
    			add_location$1(div3, file$3, 98, 10, 2785);
    			attr_dev$1(div4, "class", "flip svelte-7h5ydy");
    			set_style(div4, "position", "relative");
    			add_location$1(div4, file$3, 94, 8, 2597);
    			add_location$1(div5, file$3, 100, 8, 2842);
    			attr_dev$1(div6, "class", "myLabel row svelte-7h5ydy");
    			set_style(div6, "left", /*d*/ ctx[15].x + "px");
    			set_style(div6, "top", /*d*/ ctx[15].y + "px");
    			set_style(div6, "height", /*d*/ ctx[15].end - /*d*/ ctx[15].start + "px");
    			set_style(div6, "width", /*d*/ ctx[15].width + "px");
    			set_style(div6, "height", /*d*/ ctx[15].height + "px");
    			set_style(div6, "opacity", /*d*/ ctx[15].opacity || 1);
    			add_location$1(div6, file$3, 88, 6, 2391);
    		},
    		m: function mount(target, anchor) {
    			insert_dev$1(target, div6, anchor);
    			append_dev$1(div6, div4);
    			append_dev$1(div4, div0);
    			append_dev$1(div4, t0);
    			append_dev$1(div4, div1);
    			append_dev$1(div4, t1);
    			append_dev$1(div4, div2);
    			append_dev$1(div4, t2);
    			append_dev$1(div4, div3);
    			append_dev$1(div6, t3);
    			append_dev$1(div6, div5);
    			div5.innerHTML = raw_value;
    			append_dev$1(div6, t4);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*ourLabels*/ 32 && raw_value !== (raw_value = /*d*/ ctx[15].label + "")) div5.innerHTML = raw_value;
    			if (dirty & /*ourLabels*/ 32) {
    				set_style(div6, "left", /*d*/ ctx[15].x + "px");
    			}

    			if (dirty & /*ourLabels*/ 32) {
    				set_style(div6, "top", /*d*/ ctx[15].y + "px");
    			}

    			if (dirty & /*ourLabels*/ 32) {
    				set_style(div6, "height", /*d*/ ctx[15].end - /*d*/ ctx[15].start + "px");
    			}

    			if (dirty & /*ourLabels*/ 32) {
    				set_style(div6, "width", /*d*/ ctx[15].width + "px");
    			}

    			if (dirty & /*ourLabels*/ 32) {
    				set_style(div6, "height", /*d*/ ctx[15].height + "px");
    			}

    			if (dirty & /*ourLabels*/ 32) {
    				set_style(div6, "opacity", /*d*/ ctx[15].opacity || 1);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev$1(div6);
    		}
    	};

    	dispatch_dev$1("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1.name,
    		type: "each",
    		source: "(88:4) {#each ourLabels as d}",
    		ctx
    	});

    	return block;
    }

    // (109:4) {#each paths as d}
    function create_each_block(ctx) {
    	let path;
    	let path_d_value;
    	let path_stroke_width_value;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev$1(path, "class", "link svelte-7h5ydy");
    			attr_dev$1(path, "d", path_d_value = /*d*/ ctx[15]);
    			attr_dev$1(path, "stroke", "none");
    			attr_dev$1(path, "fill", "lightsteelblue");
    			attr_dev$1(path, "stroke-width", path_stroke_width_value = 1);
    			add_location$1(path, file$3, 109, 6, 3009);
    		},
    		m: function mount(target, anchor) {
    			insert_dev$1(target, path, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*paths*/ 16 && path_d_value !== (path_d_value = /*d*/ ctx[15])) {
    				attr_dev$1(path, "d", path_d_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev$1(path);
    		}
    	};

    	dispatch_dev$1("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(109:4) {#each paths as d}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$3(ctx) {
    	let div1;
    	let div0;
    	let t0;
    	let t1;
    	let svg;
    	let svg_viewBox_value;
    	let div1_resize_listener;
    	let t2;
    	let current;
    	let each_value_2 = /*nodes*/ ctx[3];
    	validate_each_argument$1(each_value_2);
    	let each_blocks_2 = [];

    	for (let i = 0; i < each_value_2.length; i += 1) {
    		each_blocks_2[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
    	}

    	const out = i => transition_out$1(each_blocks_2[i], 1, 1, () => {
    		each_blocks_2[i] = null;
    	});

    	let each_value_1 = /*ourLabels*/ ctx[5];
    	validate_each_argument$1(each_value_1);
    	let each_blocks_1 = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks_1[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	let each_value = /*paths*/ ctx[4];
    	validate_each_argument$1(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const default_slot_template = /*#slots*/ ctx[10].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[9], null);

    	const block = {
    		c: function create() {
    			div1 = element$1("div");
    			div0 = element$1("div");

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].c();
    			}

    			t0 = space$1();

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t1 = space$1();
    			svg = svg_element("svg");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t2 = space$1();
    			if (default_slot) default_slot.c();
    			set_style(div0, "position", "absolute");
    			set_style(div0, "width", /*width*/ ctx[2] + "px");
    			set_style(div0, "height", /*height*/ ctx[0] + "px");
    			add_location$1(div0, file$3, 37, 2, 958);
    			attr_dev$1(svg, "viewBox", svg_viewBox_value = "0,0," + /*width*/ ctx[2] + "," + /*height*/ ctx[0]);
    			attr_dev$1(svg, "width", /*width*/ ctx[2]);
    			attr_dev$1(svg, "height", /*height*/ ctx[0]);
    			add_location$1(svg, file$3, 107, 2, 2926);
    			set_style(div1, "position", "relative");
    			add_render_callback$1(() => /*div1_elementresize_handler*/ ctx[11].call(div1));
    			add_location$1(div1, file$3, 36, 0, 898);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev$1(target, div1, anchor);
    			append_dev$1(div1, div0);

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].m(div0, null);
    			}

    			append_dev$1(div0, t0);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(div0, null);
    			}

    			append_dev$1(div1, t1);
    			append_dev$1(div1, svg);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(svg, null);
    			}

    			div1_resize_listener = add_resize_listener(div1, /*div1_elementresize_handler*/ ctx[11].bind(div1));
    			insert_dev$1(target, t2, anchor);

    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*nodes, color, fmt, accent*/ 202) {
    				each_value_2 = /*nodes*/ ctx[3];
    				validate_each_argument$1(each_value_2);
    				let i;

    				for (i = 0; i < each_value_2.length; i += 1) {
    					const child_ctx = get_each_context_2(ctx, each_value_2, i);

    					if (each_blocks_2[i]) {
    						each_blocks_2[i].p(child_ctx, dirty);
    						transition_in$1(each_blocks_2[i], 1);
    					} else {
    						each_blocks_2[i] = create_each_block_2(child_ctx);
    						each_blocks_2[i].c();
    						transition_in$1(each_blocks_2[i], 1);
    						each_blocks_2[i].m(div0, t0);
    					}
    				}

    				group_outros$1();

    				for (i = each_value_2.length; i < each_blocks_2.length; i += 1) {
    					out(i);
    				}

    				check_outros$1();
    			}

    			if (dirty & /*ourLabels*/ 32) {
    				each_value_1 = /*ourLabels*/ ctx[5];
    				validate_each_argument$1(each_value_1);
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_1[i] = create_each_block_1(child_ctx);
    						each_blocks_1[i].c();
    						each_blocks_1[i].m(div0, null);
    					}
    				}

    				for (; i < each_blocks_1.length; i += 1) {
    					each_blocks_1[i].d(1);
    				}

    				each_blocks_1.length = each_value_1.length;
    			}

    			if (!current || dirty & /*width*/ 4) {
    				set_style(div0, "width", /*width*/ ctx[2] + "px");
    			}

    			if (!current || dirty & /*height*/ 1) {
    				set_style(div0, "height", /*height*/ ctx[0] + "px");
    			}

    			if (dirty & /*paths*/ 16) {
    				each_value = /*paths*/ ctx[4];
    				validate_each_argument$1(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(svg, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if (!current || dirty & /*width, height*/ 5 && svg_viewBox_value !== (svg_viewBox_value = "0,0," + /*width*/ ctx[2] + "," + /*height*/ ctx[0])) {
    				attr_dev$1(svg, "viewBox", svg_viewBox_value);
    			}

    			if (!current || dirty & /*width*/ 4) {
    				attr_dev$1(svg, "width", /*width*/ ctx[2]);
    			}

    			if (!current || dirty & /*height*/ 1) {
    				attr_dev$1(svg, "height", /*height*/ ctx[0]);
    			}

    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 512) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[9], dirty, null, null);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value_2.length; i += 1) {
    				transition_in$1(each_blocks_2[i]);
    			}

    			transition_in$1(default_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			each_blocks_2 = each_blocks_2.filter(Boolean);

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				transition_out$1(each_blocks_2[i]);
    			}

    			transition_out$1(default_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev$1(div1);
    			destroy_each$1(each_blocks_2, detaching);
    			destroy_each$1(each_blocks_1, detaching);
    			destroy_each$1(each_blocks, detaching);
    			div1_resize_listener();
    			if (detaching) detach_dev$1(t2);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};

    	dispatch_dev$1("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let $items;
    	let $labels;
    	validate_store(items, "items");
    	component_subscribe($$self, items, $$value => $$invalidate(12, $items = $$value));
    	validate_store(labels, "labels");
    	component_subscribe($$self, labels, $$value => $$invalidate(13, $labels = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots$1("Sankey", slots, ['default']);
    	let colors = spencerColor.colors;
    	let { height = 500 } = $$props;
    	let { nodeWidth = 120 } = $$props;
    	let width = 500; //this gets re-set

    	let { fmt = num => {
    		if (num >= 1000000) {
    			num = Math.round(num / 1000000) * 1000000;
    			return String(num / 1000000) + "m";
    		}

    		if (num > 1000) {
    			return String(num / 1000) + "k";
    		}

    		return String(num);
    	} } = $$props;

    	height = Number(height);
    	width = Number(width);
    	let nodes = [];
    	let paths = [];
    	let ourLabels = [];
    	let color = "steelblue";
    	let accent = "#d98b89";

    	onMount(() => {
    		let res = layout($items, width, height, nodeWidth, $labels);
    		console.log(res);
    		$$invalidate(3, nodes = res.nodes);
    		$$invalidate(4, paths = res.paths);
    		$$invalidate(5, ourLabels = res.labels);
    	});

    	const writable_props = ["height", "nodeWidth", "fmt"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console_1.warn(`<Sankey> was created with unknown prop '${key}'`);
    	});

    	function div1_elementresize_handler() {
    		width = this.clientWidth;
    		$$invalidate(2, width);
    	}

    	$$self.$$set = $$props => {
    		if ("height" in $$props) $$invalidate(0, height = $$props.height);
    		if ("nodeWidth" in $$props) $$invalidate(8, nodeWidth = $$props.nodeWidth);
    		if ("fmt" in $$props) $$invalidate(1, fmt = $$props.fmt);
    		if ("$$scope" in $$props) $$invalidate(9, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		layout,
    		Dots,
    		items,
    		labels,
    		onMount,
    		c: spencerColor,
    		colors,
    		height,
    		nodeWidth,
    		width,
    		fmt,
    		nodes,
    		paths,
    		ourLabels,
    		color,
    		accent,
    		$items,
    		$labels
    	});

    	$$self.$inject_state = $$props => {
    		if ("colors" in $$props) colors = $$props.colors;
    		if ("height" in $$props) $$invalidate(0, height = $$props.height);
    		if ("nodeWidth" in $$props) $$invalidate(8, nodeWidth = $$props.nodeWidth);
    		if ("width" in $$props) $$invalidate(2, width = $$props.width);
    		if ("fmt" in $$props) $$invalidate(1, fmt = $$props.fmt);
    		if ("nodes" in $$props) $$invalidate(3, nodes = $$props.nodes);
    		if ("paths" in $$props) $$invalidate(4, paths = $$props.paths);
    		if ("ourLabels" in $$props) $$invalidate(5, ourLabels = $$props.ourLabels);
    		if ("color" in $$props) $$invalidate(6, color = $$props.color);
    		if ("accent" in $$props) $$invalidate(7, accent = $$props.accent);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		height,
    		fmt,
    		width,
    		nodes,
    		paths,
    		ourLabels,
    		color,
    		accent,
    		nodeWidth,
    		$$scope,
    		slots,
    		div1_elementresize_handler
    	];
    }

    class Sankey extends SvelteComponentDev$1 {
    	constructor(options) {
    		super(options);
    		if (!document.getElementById("svelte-7h5ydy-style")) add_css$2();
    		init$1(this, options, instance$3, create_fragment$3, safe_not_equal$1, { height: 0, nodeWidth: 8, fmt: 1 });

    		dispatch_dev$1("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Sankey",
    			options,
    			id: create_fragment$3.name
    		});
    	}

    	get height() {
    		throw new Error("<Sankey>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set height(value) {
    		throw new Error("<Sankey>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get nodeWidth() {
    		throw new Error("<Sankey>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set nodeWidth(value) {
    		throw new Error("<Sankey>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get fmt() {
    		throw new Error("<Sankey>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set fmt(value) {
    		throw new Error("<Sankey>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* Users/spencer/mountain/somehow-sankey/src/Node.svelte generated by Svelte v3.29.0 */

    function create_fragment$4(ctx) {
    	const block = {
    		c: noop$1,
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: noop$1,
    		p: noop$1,
    		i: noop$1,
    		o: noop$1,
    		d: noop$1
    	};

    	dispatch_dev$1("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let $colCount;
    	validate_store(colCount, "colCount");
    	component_subscribe($$self, colCount, $$value => $$invalidate(17, $colCount = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots$1("Node", slots, []);
    	let colors = spencerColor.colors;
    	let { value = null } = $$props;
    	let { from = null } = $$props;
    	let { name = "" } = $$props;
    	let { full = "100" } = $$props;
    	let { to = "" } = $$props;
    	let { color = "steelblue" } = $$props;
    	let { append = "" } = $$props;
    	let { accent = "#d98b89" } = $$props;
    	let { stroke = "#d98b89" } = $$props;
    	let { show_num = true } = $$props;
    	let { show_percent = false } = $$props;
    	let { show_label = true } = $$props;
    	let { inline = false } = $$props;
    	let { dy = "0" } = $$props;
    	let { dx = "0" } = $$props;
    	let { opacity = "1" } = $$props;
    	let { after = false } = $$props;

    	if (typeof value === "string") {
    		value = value.replace(/,/g, "");
    	}

    	let row = {
    		name,
    		to,
    		after,
    		value: Number(value),
    		full: Number(full),
    		from,
    		dy: Number(dy),
    		dx: Number(dx),
    		color: colors[color] || color,
    		stroke: colors[stroke] || stroke,
    		append,
    		inline,
    		show_num,
    		show_percent,
    		show_label,
    		accent: colors[accent] || accent,
    		opacity,
    		col: $colCount
    	};

    	items.update(arr => {
    		arr.push(row);
    		return arr;
    	});

    	const writable_props = [
    		"value",
    		"from",
    		"name",
    		"full",
    		"to",
    		"color",
    		"append",
    		"accent",
    		"stroke",
    		"show_num",
    		"show_percent",
    		"show_label",
    		"inline",
    		"dy",
    		"dx",
    		"opacity",
    		"after"
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Node> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("value" in $$props) $$invalidate(0, value = $$props.value);
    		if ("from" in $$props) $$invalidate(1, from = $$props.from);
    		if ("name" in $$props) $$invalidate(2, name = $$props.name);
    		if ("full" in $$props) $$invalidate(3, full = $$props.full);
    		if ("to" in $$props) $$invalidate(4, to = $$props.to);
    		if ("color" in $$props) $$invalidate(5, color = $$props.color);
    		if ("append" in $$props) $$invalidate(6, append = $$props.append);
    		if ("accent" in $$props) $$invalidate(7, accent = $$props.accent);
    		if ("stroke" in $$props) $$invalidate(8, stroke = $$props.stroke);
    		if ("show_num" in $$props) $$invalidate(9, show_num = $$props.show_num);
    		if ("show_percent" in $$props) $$invalidate(10, show_percent = $$props.show_percent);
    		if ("show_label" in $$props) $$invalidate(11, show_label = $$props.show_label);
    		if ("inline" in $$props) $$invalidate(12, inline = $$props.inline);
    		if ("dy" in $$props) $$invalidate(13, dy = $$props.dy);
    		if ("dx" in $$props) $$invalidate(14, dx = $$props.dx);
    		if ("opacity" in $$props) $$invalidate(15, opacity = $$props.opacity);
    		if ("after" in $$props) $$invalidate(16, after = $$props.after);
    	};

    	$$self.$capture_state = () => ({
    		getContext,
    		items,
    		colCount,
    		c: spencerColor,
    		colors,
    		value,
    		from,
    		name,
    		full,
    		to,
    		color,
    		append,
    		accent,
    		stroke,
    		show_num,
    		show_percent,
    		show_label,
    		inline,
    		dy,
    		dx,
    		opacity,
    		after,
    		row,
    		$colCount
    	});

    	$$self.$inject_state = $$props => {
    		if ("colors" in $$props) colors = $$props.colors;
    		if ("value" in $$props) $$invalidate(0, value = $$props.value);
    		if ("from" in $$props) $$invalidate(1, from = $$props.from);
    		if ("name" in $$props) $$invalidate(2, name = $$props.name);
    		if ("full" in $$props) $$invalidate(3, full = $$props.full);
    		if ("to" in $$props) $$invalidate(4, to = $$props.to);
    		if ("color" in $$props) $$invalidate(5, color = $$props.color);
    		if ("append" in $$props) $$invalidate(6, append = $$props.append);
    		if ("accent" in $$props) $$invalidate(7, accent = $$props.accent);
    		if ("stroke" in $$props) $$invalidate(8, stroke = $$props.stroke);
    		if ("show_num" in $$props) $$invalidate(9, show_num = $$props.show_num);
    		if ("show_percent" in $$props) $$invalidate(10, show_percent = $$props.show_percent);
    		if ("show_label" in $$props) $$invalidate(11, show_label = $$props.show_label);
    		if ("inline" in $$props) $$invalidate(12, inline = $$props.inline);
    		if ("dy" in $$props) $$invalidate(13, dy = $$props.dy);
    		if ("dx" in $$props) $$invalidate(14, dx = $$props.dx);
    		if ("opacity" in $$props) $$invalidate(15, opacity = $$props.opacity);
    		if ("after" in $$props) $$invalidate(16, after = $$props.after);
    		if ("row" in $$props) row = $$props.row;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		value,
    		from,
    		name,
    		full,
    		to,
    		color,
    		append,
    		accent,
    		stroke,
    		show_num,
    		show_percent,
    		show_label,
    		inline,
    		dy,
    		dx,
    		opacity,
    		after
    	];
    }

    class Node extends SvelteComponentDev$1 {
    	constructor(options) {
    		super(options);

    		init$1(this, options, instance$4, create_fragment$4, safe_not_equal$1, {
    			value: 0,
    			from: 1,
    			name: 2,
    			full: 3,
    			to: 4,
    			color: 5,
    			append: 6,
    			accent: 7,
    			stroke: 8,
    			show_num: 9,
    			show_percent: 10,
    			show_label: 11,
    			inline: 12,
    			dy: 13,
    			dx: 14,
    			opacity: 15,
    			after: 16
    		});

    		dispatch_dev$1("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Node",
    			options,
    			id: create_fragment$4.name
    		});
    	}

    	get value() {
    		throw new Error("<Node>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set value(value) {
    		throw new Error("<Node>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get from() {
    		throw new Error("<Node>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set from(value) {
    		throw new Error("<Node>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get name() {
    		throw new Error("<Node>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set name(value) {
    		throw new Error("<Node>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get full() {
    		throw new Error("<Node>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set full(value) {
    		throw new Error("<Node>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get to() {
    		throw new Error("<Node>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set to(value) {
    		throw new Error("<Node>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get color() {
    		throw new Error("<Node>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set color(value) {
    		throw new Error("<Node>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get append() {
    		throw new Error("<Node>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set append(value) {
    		throw new Error("<Node>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get accent() {
    		throw new Error("<Node>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set accent(value) {
    		throw new Error("<Node>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get stroke() {
    		throw new Error("<Node>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set stroke(value) {
    		throw new Error("<Node>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get show_num() {
    		throw new Error("<Node>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set show_num(value) {
    		throw new Error("<Node>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get show_percent() {
    		throw new Error("<Node>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set show_percent(value) {
    		throw new Error("<Node>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get show_label() {
    		throw new Error("<Node>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set show_label(value) {
    		throw new Error("<Node>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get inline() {
    		throw new Error("<Node>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set inline(value) {
    		throw new Error("<Node>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get dy() {
    		throw new Error("<Node>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set dy(value) {
    		throw new Error("<Node>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get dx() {
    		throw new Error("<Node>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set dx(value) {
    		throw new Error("<Node>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get opacity() {
    		throw new Error("<Node>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set opacity(value) {
    		throw new Error("<Node>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get after() {
    		throw new Error("<Node>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set after(value) {
    		throw new Error("<Node>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    const uuid$1 = function () {
      return 'xxxxxx'.replace(/[xy]/g, function (c) {
        let r = (Math.random() * 16) | 0; //eslint-disable-line
        let v = c === 'x' ? r : (r & 0x3) | 0x8; //eslint-disable-line
        return v.toString(16)
      })
    };

    /* Users/spencer/mountain/somehow-sankey/src/Col.svelte generated by Svelte v3.29.0 */
    const file$4 = "Users/spencer/mountain/somehow-sankey/src/Col.svelte";

    function create_fragment$5(ctx) {
    	let div;
    	let current;
    	const default_slot_template = /*#slots*/ ctx[1].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[0], null);

    	const block = {
    		c: function create() {
    			div = element$1("div");
    			if (default_slot) default_slot.c();
    			add_location$1(div, file$4, 11, 0, 191);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev$1(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 1) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[0], dirty, null, null);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in$1(default_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out$1(default_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev$1(div);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};

    	dispatch_dev$1("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$5.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let $colCount;
    	validate_store(colCount, "colCount");
    	component_subscribe($$self, colCount, $$value => $$invalidate(2, $colCount = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots$1("Col", slots, ['default']);
    	set_store_value(colCount, $colCount += 1, $colCount);
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Col> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("$$scope" in $$props) $$invalidate(0, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		onMount,
    		setContext,
    		getContext,
    		colCount,
    		uuid: uuid$1,
    		$colCount
    	});

    	return [$$scope, slots];
    }

    class Col extends SvelteComponentDev$1 {
    	constructor(options) {
    		super(options);
    		init$1(this, options, instance$5, create_fragment$5, safe_not_equal$1, {});

    		dispatch_dev$1("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Col",
    			options,
    			id: create_fragment$5.name
    		});
    	}
    }

    /* Users/spencer/mountain/somehow-sankey/src/Label.svelte generated by Svelte v3.29.0 */

    function create_fragment$6(ctx) {
    	const block = {
    		c: noop$1,
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: noop$1,
    		p: noop$1,
    		i: noop$1,
    		o: noop$1,
    		d: noop$1
    	};

    	dispatch_dev$1("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$6.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let $colCount;
    	validate_store(colCount, "colCount");
    	component_subscribe($$self, colCount, $$value => $$invalidate(5, $colCount = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots$1("Label", slots, []);
    	let colors = spencerColor.colors;
    	let { start = 100 } = $$props;
    	let { width = 100 } = $$props;
    	let { end = 0 } = $$props;
    	let { label = "hi" } = $$props;
    	let { color = "lightgrey" } = $$props;

    	let row = {
    		type: "label",
    		start,
    		end,
    		label,
    		width,
    		color,
    		color: colors[color] || color,
    		col: $colCount
    	};

    	labels.update(arr => {
    		arr.push(row);
    		return arr;
    	});

    	const writable_props = ["start", "width", "end", "label", "color"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Label> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("start" in $$props) $$invalidate(0, start = $$props.start);
    		if ("width" in $$props) $$invalidate(1, width = $$props.width);
    		if ("end" in $$props) $$invalidate(2, end = $$props.end);
    		if ("label" in $$props) $$invalidate(3, label = $$props.label);
    		if ("color" in $$props) $$invalidate(4, color = $$props.color);
    	};

    	$$self.$capture_state = () => ({
    		getContext,
    		labels,
    		colCount,
    		c: spencerColor,
    		colors,
    		start,
    		width,
    		end,
    		label,
    		color,
    		row,
    		$colCount
    	});

    	$$self.$inject_state = $$props => {
    		if ("colors" in $$props) colors = $$props.colors;
    		if ("start" in $$props) $$invalidate(0, start = $$props.start);
    		if ("width" in $$props) $$invalidate(1, width = $$props.width);
    		if ("end" in $$props) $$invalidate(2, end = $$props.end);
    		if ("label" in $$props) $$invalidate(3, label = $$props.label);
    		if ("color" in $$props) $$invalidate(4, color = $$props.color);
    		if ("row" in $$props) row = $$props.row;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [start, width, end, label, color];
    }

    class Label extends SvelteComponentDev$1 {
    	constructor(options) {
    		super(options);

    		init$1(this, options, instance$6, create_fragment$6, safe_not_equal$1, {
    			start: 0,
    			width: 1,
    			end: 2,
    			label: 3,
    			color: 4
    		});

    		dispatch_dev$1("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Label",
    			options,
    			id: create_fragment$6.name
    		});
    	}

    	get start() {
    		throw new Error("<Label>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set start(value) {
    		throw new Error("<Label>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get width() {
    		throw new Error("<Label>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set width(value) {
    		throw new Error("<Label>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get end() {
    		throw new Error("<Label>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set end(value) {
    		throw new Error("<Label>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get label() {
    		throw new Error("<Label>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set label(value) {
    		throw new Error("<Label>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get color() {
    		throw new Error("<Label>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set color(value) {
    		throw new Error("<Label>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    var counts = [
      {
        total: 39297,
        pending: 10238,
        issued: 29059,
        name: 'Spadina-Fort York'
      },
      {
        total: 32950,
        pending: 14003,
        issued: 18947,
        name: 'Toronto Centre'
      },
      {
        total: 15217,
        pending: 4067,
        issued: 11150,
        name: "Toronto-St. Paul's"
      },
      {
        total: 14850,
        pending: 4672,
        issued: 10178,
        name: 'University-Rosedale'
      },
      {
        total: 14077,
        pending: 3293,
        issued: 10784,
        name: 'Etobicoke-Lakeshore'
      },
      { total: 7345, pending: 2081, issued: 5264, name: 'Willowdale' },
      { total: 6984, pending: 2151, issued: 4833, name: 'Davenport' },
      { total: 6233, pending: 412, issued: 5821, name: 'Don Valley North' },
      {
        total: 4978,
        pending: 1443,
        issued: 3535,
        name: 'Parkdale-High Park'
      },
      { total: 4777, pending: 1843, issued: 2934, name: 'York Centre' },
      { total: 3790, pending: 2344, issued: 1446, name: 'Don Valley West' },
      {
        total: 3651,
        pending: 956,
        issued: 2695,
        name: 'Scarborough-Agincourt'
      },
      {
        total: 3403,
        pending: 1592,
        issued: 1811,
        name: 'Etobicoke Centre'
      },
      { total: 3227, pending: 1572, issued: 1655, name: 'Don Valley East' },
      {
        total: 3139,
        pending: 1529,
        issued: 1610,
        name: 'Eglinton-Lawrence'
      },
      { total: 2954, pending: 842, issued: 2112, name: 'Toronto-Danforth' },
      {
        total: 2557,
        pending: 1314,
        issued: 1243,
        name: 'Beaches-East York'
      },
      {
        total: 2352,
        pending: 670,
        issued: 1682,
        name: 'York South-Weston'
      },
      {
        total: 1707,
        pending: 1217,
        issued: 490,
        name: 'Scarborough Southwest'
      },
      {
        total: 1479,
        pending: 967,
        issued: 512,
        name: 'Scarborough-Guildwood'
      },
      {
        total: 1335,
        pending: 1058,
        issued: 277,
        name: 'Humber River-Black Creek'
      },
      {
        total: 1251,
        pending: 1237,
        issued: 14,
        name: 'Scarborough-Rouge Park'
      },
      {
        total: 1037,
        pending: 1023,
        issued: 14,
        name: 'Scarborough Centre'
      },
      { total: 514, pending: 341, issued: 173, name: 'Etobicoke North' },
      { total: 202, pending: 0, issued: 202, name: 'Scarborough North' }
    ];

    /* 2022/riding-sankey/Post.svelte generated by Svelte v3.29.0 */
    const file$5 = "2022/riding-sankey/Post.svelte";

    function add_css$3() {
    	var style = element("style");
    	style.id = "svelte-9o6vm9-style";
    	style.textContent = ".col.svelte-9o6vm9{display:flex;flex-direction:column;align-items:center}.center.svelte-9o6vm9{text-align:center;margin:3rem}.container.svelte-9o6vm9{max-width:800px;min-width:650px;flex-grow:1;margin-top:3rem}.source.svelte-9o6vm9{margin:1rem;font-size:12px;color:grey;text-align:right}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUG9zdC5zdmVsdGUiLCJzb3VyY2VzIjpbIlBvc3Quc3ZlbHRlIl0sInNvdXJjZXNDb250ZW50IjpbIjxzY3JpcHQ+XG4gIGltcG9ydCBIZWFkIGZyb20gJy4uLy4uL2NvbXBvbmVudHMvSGVhZC5zdmVsdGUnXG4gIGltcG9ydCBGb290IGZyb20gJy4uLy4uL2NvbXBvbmVudHMvRm9vdC5zdmVsdGUnXG4gIGltcG9ydCB7IFNhbmtleSwgTm9kZSwgQ29sLCBMYWJlbCB9IGZyb20gJy9Vc2Vycy9zcGVuY2VyL21vdW50YWluL3NvbWVob3ctc2Fua2V5L3NyYy9pbmRleC5tanMnXG4gIGltcG9ydCBjb3VudHMgZnJvbSAnLi9jb3VudHMuanMnXG4gIGxldCBzdW0gPSBjb3VudHMucmVkdWNlKChoLCBhKSA9PiB7XG4gICAgaCArPSBhLnRvdGFsXG4gICAgcmV0dXJuIGhcbiAgfSwgMClcblxuICBjb25zdCBjb2xvcnMgPSB7XG4gICAgJ1NwYWRpbmEtRm9ydCBZb3JrJzogJyNENjg4ODEnLFxuICAgICdUb3JvbnRvIENlbnRyZSc6ICcjNjY5OWNjJyxcbiAgICAnVW5pdmVyc2l0eS1Sb3NlZGFsZSc6ICcjY2M2OTY2JyxcbiAgICAnRXRvYmljb2tlLUxha2VzaG9yZSc6ICcjMkQ4NUE4JyxcbiAgICBcIlRvcm9udG8tU3QuIFBhdWwnc1wiOiAncmdiKDExNSwgMTIxLCAxNTUpJyxcbiAgICAnUGFya2RhbGUtSGlnaCBQYXJrJzogJyMyRDg1QTgnLFxuICAgICdUb3JvbnRvLURhbmZvcnRoJzogJyM3Mzc5OUInLFxuICAgIFdpbGxvd2RhbGU6ICcjNTg1QTczJyxcbiAgICAnRWdsaW50b24tTGF3cmVuY2UnOiAnI2NjNjk2NicsXG4gICAgRGF2ZW5wb3J0OiAncmdiKDExNSwgMTIxLCAxNTUpJyxcblxuICAgICdEb24gVmFsbGV5IE5vcnRoJzogJyNjYzhhNjYnLFxuICAgICdFdG9iaWNva2UgQ2VudHJlJzogJyM4MzhCOTEnLFxuICAgICdCZWFjaGVzLUVhc3QgWW9yayc6ICcjNzM1ODczJyxcbiAgICAnWW9yayBTb3V0aC1XZXN0b24nOiAnI0Q2ODg4MScsXG4gICAgJ1lvcmsgQ2VudHJlJzogJyM0RDY4OTknLFxuICAgICdEb24gVmFsbGV5IFdlc3QnOiAnI0Q2ODg4MScsXG4gICAgJ1NjYXJib3JvdWdoIFNvdXRod2VzdCc6ICcjNjY5OWNjJyxcbiAgICAnRG9uIFZhbGxleSBFYXN0JzogJ3JnYigxMTUsIDEyMSwgMTU1KScsXG4gICAgJ1NjYXJib3JvdWdoLUFnaW5jb3VydCc6ICcjMkQ4NUE4JyxcbiAgICAnRXRvYmljb2tlIE5vcnRoJzogJyM5NzhCQTMnLFxuICAgICdTY2FyYm9yb3VnaC1Sb3VnZSBQYXJrJzogJyNjYzY5NjYnLFxuICAgICdTY2FyYm9yb3VnaCBDZW50cmUnOiAnIzkxNDA0NScsXG4gICAgJ1NjYXJib3JvdWdoLUd1aWxkd29vZCc6ICcjY2M2OTY2JyxcbiAgICAnSHVtYmVyIFJpdmVyLUJsYWNrIENyZWVrJzogJyNBQjU4NTAnLFxuICAgICdTY2FyYm9yb3VnaCBOb3J0aCc6ICcjNjY5OWNjJyxcbiAgfVxuXG4gIGxldCBmbXQgPSAobnVtKSA9PiB7XG4gICAgaWYgKG51bSA+IDEwMDApIHtcbiAgICAgIG51bSA9IE1hdGgucm91bmQobnVtIC8gMTAwMCkgKiAxMDAwXG4gICAgICByZXR1cm4gU3RyaW5nKG51bSAvIDEwMDApICsgJ2snXG4gICAgfVxuICAgIHJldHVybiBudW1cbiAgfVxuICBsZXQgdGl0bGUgPSAnQWN0aXZlIGhvdXNpbmcgYXBwbGljYXRpb25zIGJ5IFRvcm9udG8gd2FyZCdcbjwvc2NyaXB0PlxuXG48SGVhZCB7dGl0bGV9IG51bT1cIjA2XCIgLz5cbjxkaXYgY2xhc3M9XCJjZW50ZXIgY29sXCI+XG4gIDxkaXYgY2xhc3M9XCJjb250YWluZXJcIj5cbiAgICA8U2Fua2V5IGhlaWdodD1cIjcwMFwiIHtmbXR9PlxuICAgICAgPENvbD5cbiAgICAgICAgPE5vZGUgbmFtZT1cIkhvdXNpbmcgVW5pdHNcIiB2YWx1ZT17c3VtfSBjb2xvcj1cIiMyRDg1QThcIiBhY2NlbnQ9XCIjNjY5OWNjXCIgc2hvd19udW09e2ZhbHNlfSAvPlxuICAgICAgPC9Db2w+XG4gICAgICA8Q29sPlxuICAgICAgICB7I2VhY2ggY291bnRzIGFzIGEsIGl9XG4gICAgICAgICAgPE5vZGVcbiAgICAgICAgICAgIG5hbWU9e2EubmFtZX1cbiAgICAgICAgICAgIHN0cm9rZT1cIiNkN2Q1ZDJcIlxuICAgICAgICAgICAgZnJvbT1cIkhvdXNpbmcgVW5pdHNcIlxuICAgICAgICAgICAgdmFsdWU9e2EudG90YWx9XG4gICAgICAgICAgICBsYWJlbD17JzUlJ31cbiAgICAgICAgICAgIGFjY2VudD17Y29sb3JzW2EubmFtZV19XG4gICAgICAgICAgICBjb2xvcj17Y29sb3JzW2EubmFtZV19XG4gICAgICAgICAgICBhZnRlcj17aSA+IDZ9XG4gICAgICAgICAgICBpbmxpbmU9e2kgPT09IDUgfHwgaSA9PT0gNn1cbiAgICAgICAgICAgIHNob3dfcGVyY2VudD17aSA8IDd9XG4gICAgICAgICAgICBzaG93X251bT17ZmFsc2V9XG4gICAgICAgICAgICBzaG93X2xhYmVsPXtpIDwgNH1cbiAgICAgICAgICAvPlxuICAgICAgICB7L2VhY2h9XG4gICAgICA8L0NvbD5cbiAgICAgIDxDb2w+XG4gICAgICAgIDxMYWJlbCBzdGFydD17MH0gZW5kPXsxNDc3MjB9IGxhYmVsPVwiNyBXYXJkczxici8+NzUlIG9mIGFwcGxpY2F0aW9uc1wiIC8+XG4gICAgICA8L0NvbD5cbiAgICAgIDwhLS0gPENvbD5cbiAgICAgICAgeyNlYWNoIGNvdW50cyBhcyBvLCBpfVxuICAgICAgICAgIHsjaWYgaSA8IDZ9XG4gICAgICAgICAgICA8Tm9kZVxuICAgICAgICAgICAgICBuYW1lPXtpIDw9IDIgPyAnSXNzdWVkJyA6ICcnfVxuICAgICAgICAgICAgICBmcm9tPXtvLm5hbWV9XG4gICAgICAgICAgICAgIHZhbHVlPXtvLmlzc3VlZH1cbiAgICAgICAgICAgICAgY29sb3I9XCJzZWFcIlxuICAgICAgICAgICAgICBvcGFjaXR5PVwiMC43XCJcbiAgICAgICAgICAgICAgYWZ0ZXI9e2kgPj0gMn1cbiAgICAgICAgICAgIC8+XG4gICAgICAgICAgICA8Tm9kZVxuICAgICAgICAgICAgICBuYW1lPXtpIDw9IDIgPyAnUGVuZGluZycgOiAnJ31cbiAgICAgICAgICAgICAgZnJvbT17by5uYW1lfVxuICAgICAgICAgICAgICB2YWx1ZT17by5wZW5kaW5nfVxuICAgICAgICAgICAgICBjb2xvcj1cIiNjNGFiYWJcIlxuICAgICAgICAgICAgICBhZnRlcj17aSA+PSAyfVxuICAgICAgICAgICAgICBvcGFjaXR5PVwiMC42XCJcbiAgICAgICAgICAgIC8+XG4gICAgICAgICAgey9pZn1cbiAgICAgICAgey9lYWNofVxuICAgICAgPC9Db2w+IC0tPlxuICAgIDwvU2Fua2V5PlxuICAgIDxkaXYgY2xhc3M9XCJzb3VyY2VcIj5cbiAgICAgIDxhIGhyZWY9XCJodHRwczovL29wZW4udG9yb250by5jYS9kYXRhc2V0L2J1aWxkaW5nLXBlcm1pdHMtYWN0aXZlLXBlcm1pdHMvXCI+QWN0aXZlIHBlcm1pdHM8L2E+XG4gICAgICAtIHRvcm9udG8uY2EsIE9jdCAyMDIyXG4gICAgPC9kaXY+XG4gIDwvZGl2PlxuPC9kaXY+XG48Rm9vdCB7dGl0bGV9IC8+XG5cbjxzdHlsZT5cbiAgLmNvbCB7XG4gICAgZGlzcGxheTogZmxleDtcbiAgICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gIH1cbiAgLmNlbnRlciB7XG4gICAgdGV4dC1hbGlnbjogY2VudGVyO1xuICAgIG1hcmdpbjogM3JlbTtcbiAgfVxuICAuY29udGFpbmVyIHtcbiAgICBtYXgtd2lkdGg6IDgwMHB4O1xuICAgIG1pbi13aWR0aDogNjUwcHg7XG4gICAgZmxleC1ncm93OiAxO1xuICAgIG1hcmdpbi10b3A6IDNyZW07XG4gIH1cbiAgLnNvdXJjZSB7XG4gICAgbWFyZ2luOiAxcmVtO1xuICAgIGZvbnQtc2l6ZTogMTJweDtcbiAgICBjb2xvcjogZ3JleTtcbiAgICB0ZXh0LWFsaWduOiByaWdodDtcbiAgfVxuPC9zdHlsZT5cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUE2R0UsSUFBSSxjQUFDLENBQUMsQUFDSixPQUFPLENBQUUsSUFBSSxDQUNiLGNBQWMsQ0FBRSxNQUFNLENBQ3RCLFdBQVcsQ0FBRSxNQUFNLEFBQ3JCLENBQUMsQUFDRCxPQUFPLGNBQUMsQ0FBQyxBQUNQLFVBQVUsQ0FBRSxNQUFNLENBQ2xCLE1BQU0sQ0FBRSxJQUFJLEFBQ2QsQ0FBQyxBQUNELFVBQVUsY0FBQyxDQUFDLEFBQ1YsU0FBUyxDQUFFLEtBQUssQ0FDaEIsU0FBUyxDQUFFLEtBQUssQ0FDaEIsU0FBUyxDQUFFLENBQUMsQ0FDWixVQUFVLENBQUUsSUFBSSxBQUNsQixDQUFDLEFBQ0QsT0FBTyxjQUFDLENBQUMsQUFDUCxNQUFNLENBQUUsSUFBSSxDQUNaLFNBQVMsQ0FBRSxJQUFJLENBQ2YsS0FBSyxDQUFFLElBQUksQ0FDWCxVQUFVLENBQUUsS0FBSyxBQUNuQixDQUFDIn0= */";
    	append_dev(document.head, style);
    }

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[4] = list[i];
    	child_ctx[6] = i;
    	return child_ctx;
    }

    // (54:6) <Col>
    function create_default_slot_3(ctx) {
    	let node;
    	let current;

    	node = new Node({
    			props: {
    				name: "Housing Units",
    				value: /*sum*/ ctx[0],
    				color: "#2D85A8",
    				accent: "#6699cc",
    				show_num: false
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(node.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(node, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(node.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(node.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(node, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_3.name,
    		type: "slot",
    		source: "(54:6) <Col>",
    		ctx
    	});

    	return block;
    }

    // (58:8) {#each counts as a, i}
    function create_each_block$1(ctx) {
    	let node;
    	let current;

    	node = new Node({
    			props: {
    				name: /*a*/ ctx[4].name,
    				stroke: "#d7d5d2",
    				from: "Housing Units",
    				value: /*a*/ ctx[4].total,
    				label: "5%",
    				accent: /*colors*/ ctx[1][/*a*/ ctx[4].name],
    				color: /*colors*/ ctx[1][/*a*/ ctx[4].name],
    				after: /*i*/ ctx[6] > 6,
    				inline: /*i*/ ctx[6] === 5 || /*i*/ ctx[6] === 6,
    				show_percent: /*i*/ ctx[6] < 7,
    				show_num: false,
    				show_label: /*i*/ ctx[6] < 4
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(node.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(node, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(node.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(node.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(node, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$1.name,
    		type: "each",
    		source: "(58:8) {#each counts as a, i}",
    		ctx
    	});

    	return block;
    }

    // (57:6) <Col>
    function create_default_slot_2(ctx) {
    	let each_1_anchor;
    	let current;
    	let each_value = counts;
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	const block = {
    		c: function create() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_dev(target, each_1_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*counts, colors*/ 2) {
    				each_value = counts;
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach_dev(each_1_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_2.name,
    		type: "slot",
    		source: "(57:6) <Col>",
    		ctx
    	});

    	return block;
    }

    // (75:6) <Col>
    function create_default_slot_1(ctx) {
    	let label;
    	let current;

    	label = new Label({
    			props: {
    				start: 0,
    				end: 147720,
    				label: "7 Wards<br/>75% of applications"
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(label.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(label, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(label.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(label.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(label, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_1.name,
    		type: "slot",
    		source: "(75:6) <Col>",
    		ctx
    	});

    	return block;
    }

    // (53:4) <Sankey height="700" {fmt}>
    function create_default_slot(ctx) {
    	let col0;
    	let t0;
    	let col1;
    	let t1;
    	let col2;
    	let current;

    	col0 = new Col({
    			props: {
    				$$slots: { default: [create_default_slot_3] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	col1 = new Col({
    			props: {
    				$$slots: { default: [create_default_slot_2] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	col2 = new Col({
    			props: {
    				$$slots: { default: [create_default_slot_1] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(col0.$$.fragment);
    			t0 = space();
    			create_component(col1.$$.fragment);
    			t1 = space();
    			create_component(col2.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(col0, target, anchor);
    			insert_dev(target, t0, anchor);
    			mount_component(col1, target, anchor);
    			insert_dev(target, t1, anchor);
    			mount_component(col2, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const col0_changes = {};

    			if (dirty & /*$$scope*/ 128) {
    				col0_changes.$$scope = { dirty, ctx };
    			}

    			col0.$set(col0_changes);
    			const col1_changes = {};

    			if (dirty & /*$$scope*/ 128) {
    				col1_changes.$$scope = { dirty, ctx };
    			}

    			col1.$set(col1_changes);
    			const col2_changes = {};

    			if (dirty & /*$$scope*/ 128) {
    				col2_changes.$$scope = { dirty, ctx };
    			}

    			col2.$set(col2_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(col0.$$.fragment, local);
    			transition_in(col1.$$.fragment, local);
    			transition_in(col2.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(col0.$$.fragment, local);
    			transition_out(col1.$$.fragment, local);
    			transition_out(col2.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(col0, detaching);
    			if (detaching) detach_dev(t0);
    			destroy_component(col1, detaching);
    			if (detaching) detach_dev(t1);
    			destroy_component(col2, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot.name,
    		type: "slot",
    		source: "(53:4) <Sankey height=\\\"700\\\" {fmt}>",
    		ctx
    	});

    	return block;
    }

    function create_fragment$7(ctx) {
    	let head;
    	let t0;
    	let div2;
    	let div1;
    	let sankey;
    	let t1;
    	let div0;
    	let a;
    	let t3;
    	let t4;
    	let foot;
    	let current;

    	head = new Head({
    			props: { title: /*title*/ ctx[3], num: "06" },
    			$$inline: true
    		});

    	sankey = new Sankey({
    			props: {
    				height: "700",
    				fmt: /*fmt*/ ctx[2],
    				$$slots: { default: [create_default_slot] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	foot = new Foot({
    			props: { title: /*title*/ ctx[3] },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(head.$$.fragment);
    			t0 = space();
    			div2 = element("div");
    			div1 = element("div");
    			create_component(sankey.$$.fragment);
    			t1 = space();
    			div0 = element("div");
    			a = element("a");
    			a.textContent = "Active permits";
    			t3 = text("\n      - toronto.ca, Oct 2022");
    			t4 = space();
    			create_component(foot.$$.fragment);
    			attr_dev(a, "href", "https://open.toronto.ca/dataset/building-permits-active-permits/");
    			add_location(a, file$5, 101, 6, 2912);
    			attr_dev(div0, "class", "source svelte-9o6vm9");
    			add_location(div0, file$5, 100, 4, 2885);
    			attr_dev(div1, "class", "container svelte-9o6vm9");
    			add_location(div1, file$5, 51, 2, 1545);
    			attr_dev(div2, "class", "center col svelte-9o6vm9");
    			add_location(div2, file$5, 50, 0, 1518);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			mount_component(head, target, anchor);
    			insert_dev(target, t0, anchor);
    			insert_dev(target, div2, anchor);
    			append_dev(div2, div1);
    			mount_component(sankey, div1, null);
    			append_dev(div1, t1);
    			append_dev(div1, div0);
    			append_dev(div0, a);
    			append_dev(div0, t3);
    			insert_dev(target, t4, anchor);
    			mount_component(foot, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const sankey_changes = {};

    			if (dirty & /*$$scope*/ 128) {
    				sankey_changes.$$scope = { dirty, ctx };
    			}

    			sankey.$set(sankey_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(head.$$.fragment, local);
    			transition_in(sankey.$$.fragment, local);
    			transition_in(foot.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(head.$$.fragment, local);
    			transition_out(sankey.$$.fragment, local);
    			transition_out(foot.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(head, detaching);
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(div2);
    			destroy_component(sankey);
    			if (detaching) detach_dev(t4);
    			destroy_component(foot, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$7.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$7($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Post", slots, []);

    	let sum = counts.reduce(
    		(h, a) => {
    			h += a.total;
    			return h;
    		},
    		0
    	);

    	const colors = {
    		"Spadina-Fort York": "#D68881",
    		"Toronto Centre": "#6699cc",
    		"University-Rosedale": "#cc6966",
    		"Etobicoke-Lakeshore": "#2D85A8",
    		"Toronto-St. Paul's": "rgb(115, 121, 155)",
    		"Parkdale-High Park": "#2D85A8",
    		"Toronto-Danforth": "#73799B",
    		Willowdale: "#585A73",
    		"Eglinton-Lawrence": "#cc6966",
    		Davenport: "rgb(115, 121, 155)",
    		"Don Valley North": "#cc8a66",
    		"Etobicoke Centre": "#838B91",
    		"Beaches-East York": "#735873",
    		"York South-Weston": "#D68881",
    		"York Centre": "#4D6899",
    		"Don Valley West": "#D68881",
    		"Scarborough Southwest": "#6699cc",
    		"Don Valley East": "rgb(115, 121, 155)",
    		"Scarborough-Agincourt": "#2D85A8",
    		"Etobicoke North": "#978BA3",
    		"Scarborough-Rouge Park": "#cc6966",
    		"Scarborough Centre": "#914045",
    		"Scarborough-Guildwood": "#cc6966",
    		"Humber River-Black Creek": "#AB5850",
    		"Scarborough North": "#6699cc"
    	};

    	let fmt = num => {
    		if (num > 1000) {
    			num = Math.round(num / 1000) * 1000;
    			return String(num / 1000) + "k";
    		}

    		return num;
    	};

    	let title = "Active housing applications by Toronto ward";
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Post> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({
    		Head,
    		Foot,
    		Sankey,
    		Node,
    		Col,
    		Label,
    		counts,
    		sum,
    		colors,
    		fmt,
    		title
    	});

    	$$self.$inject_state = $$props => {
    		if ("sum" in $$props) $$invalidate(0, sum = $$props.sum);
    		if ("fmt" in $$props) $$invalidate(2, fmt = $$props.fmt);
    		if ("title" in $$props) $$invalidate(3, title = $$props.title);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [sum, colors, fmt, title];
    }

    class Post extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		if (!document.getElementById("svelte-9o6vm9-style")) add_css$3();
    		init(this, options, instance$7, create_fragment$7, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Post",
    			options,
    			id: create_fragment$7.name
    		});
    	}
    }

    let name = '';
    // wire-in query params
    const URLSearchParams = window.URLSearchParams;
    if (typeof URLSearchParams !== undefined) {
      const urlParams = new URLSearchParams(window.location.search);
      const myParam = urlParams.get('name');
      if (myParam) {
        name = myParam;
      }
    }

    const app = new Post({
      target: document.body,
      props: {
        name: name,
      },
    });

    return app;

}());