var app = (function () {
    'use strict';

    function noop() { }
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
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
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
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
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
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
    	style.id = "svelte-2kl8gv-style";
    	style.textContent = ".goleft.svelte-2kl8gv{align-self:flex-start;transition:margin-left 250ms;padding:2rem;padding-top:1rem;cursor:pointer}.title.svelte-2kl8gv{font-size:18px}.sub.svelte-2kl8gv{margin-left:3rem;color:grey;text-align:right;margin-top:5px}.titlebox.svelte-2kl8gv{width:400px}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSGVhZC5zdmVsdGUiLCJzb3VyY2VzIjpbIkhlYWQuc3ZlbHRlIl0sInNvdXJjZXNDb250ZW50IjpbIjxzY3JpcHQ+XG4gIGV4cG9ydCBsZXQgaHJlZiA9ICcuLi8uLi8nXG4gIGV4cG9ydCBsZXQgdGl0bGUgPSAnJ1xuICBleHBvcnQgbGV0IHN1YiA9ICcnXG4gIGV4cG9ydCBsZXQgY29sb3IgPSAnIzc2OWJiNSdcbjwvc2NyaXB0PlxuXG48ZGl2IGNsYXNzPVwiZ29sZWZ0XCI+XG4gIDxhIHtocmVmfT5cbiAgICA8c3ZnIHdpZHRoPVwiMTVweFwiIGhlaWdodD1cIjMwcHhcIiB2aWV3Qm94PVwiMCAwIDkwIDE3MFwiPlxuICAgICAgPGcgc3Ryb2tlPVwibm9uZVwiIHN0cm9rZS13aWR0aD1cIjFcIiBmaWxsPVwibm9uZVwiIGZpbGwtcnVsZT1cImV2ZW5vZGRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPlxuICAgICAgICA8cGF0aFxuICAgICAgICAgIGQ9XCJNODEuNSw2IEM2OS44MjQwNjY2LDIzLjUxMzkwMDEgNDUuODI0MDY2Niw0OS45Mjc3NjM1IDkuNSw4NS4yNDE1OTAyXG4gICAgICAgIEM0NS43OTg0ODE0LDEyMC44MDY4NiA2OS43OTg0ODE0LDE0Ny4yMjYzMyA4MS41LDE2NC41XCJcbiAgICAgICAgICBzdHJva2U9e2NvbG9yfVxuICAgICAgICAgIHN0cm9rZS13aWR0aD1cIjIwXCJcbiAgICAgICAgICBmaWxsLXJ1bGU9XCJub256ZXJvXCJcbiAgICAgICAgLz5cbiAgICAgIDwvZz5cbiAgICA8L3N2Zz5cbiAgPC9hPlxuPC9kaXY+XG48ZGl2IGNsYXNzPVwidGl0bGVib3hcIj5cbiAgPGRpdiBjbGFzcz1cInRpdGxlXCI+e0BodG1sIHRpdGxlfTwvZGl2PlxuICA8ZGl2IGNsYXNzPVwic3ViXCI+e3N1Yn08L2Rpdj5cbjwvZGl2PlxuXG48c3R5bGU+XG4gIC5nb2xlZnQge1xuICAgIGFsaWduLXNlbGY6IGZsZXgtc3RhcnQ7XG4gICAgdHJhbnNpdGlvbjogbWFyZ2luLWxlZnQgMjUwbXM7XG4gICAgcGFkZGluZzogMnJlbTtcbiAgICBwYWRkaW5nLXRvcDogMXJlbTtcbiAgICBjdXJzb3I6IHBvaW50ZXI7XG4gIH1cbiAgLyogLmdvbGVmdDpob3ZlciB7XG4gICAgbWFyZ2luLWxlZnQ6IDAuOHJlbTtcbiAgfSAqL1xuICAudGl0bGUge1xuICAgIGZvbnQtc2l6ZTogMThweDtcbiAgfVxuICAuc3ViIHtcbiAgICBtYXJnaW4tbGVmdDogM3JlbTtcbiAgICBjb2xvcjogZ3JleTtcbiAgICB0ZXh0LWFsaWduOiByaWdodDtcbiAgICBtYXJnaW4tdG9wOiA1cHg7XG4gIH1cbiAgLnRpdGxlYm94IHtcbiAgICB3aWR0aDogNDAwcHg7XG4gIH1cbjwvc3R5bGU+XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBNEJFLE9BQU8sY0FBQyxDQUFDLEFBQ1AsVUFBVSxDQUFFLFVBQVUsQ0FDdEIsVUFBVSxDQUFFLFdBQVcsQ0FBQyxLQUFLLENBQzdCLE9BQU8sQ0FBRSxJQUFJLENBQ2IsV0FBVyxDQUFFLElBQUksQ0FDakIsTUFBTSxDQUFFLE9BQU8sQUFDakIsQ0FBQyxBQUlELE1BQU0sY0FBQyxDQUFDLEFBQ04sU0FBUyxDQUFFLElBQUksQUFDakIsQ0FBQyxBQUNELElBQUksY0FBQyxDQUFDLEFBQ0osV0FBVyxDQUFFLElBQUksQ0FDakIsS0FBSyxDQUFFLElBQUksQ0FDWCxVQUFVLENBQUUsS0FBSyxDQUNqQixVQUFVLENBQUUsR0FBRyxBQUNqQixDQUFDLEFBQ0QsU0FBUyxjQUFDLENBQUMsQUFDVCxLQUFLLENBQUUsS0FBSyxBQUNkLENBQUMifQ== */";
    	append_dev(document.head, style);
    }

    function create_fragment(ctx) {
    	let div0;
    	let a;
    	let svg;
    	let g;
    	let path;
    	let t0;
    	let div3;
    	let div1;
    	let t1;
    	let div2;
    	let t2;

    	const block = {
    		c: function create() {
    			div0 = element("div");
    			a = element("a");
    			svg = svg_element("svg");
    			g = svg_element("g");
    			path = svg_element("path");
    			t0 = space();
    			div3 = element("div");
    			div1 = element("div");
    			t1 = space();
    			div2 = element("div");
    			t2 = text(/*sub*/ ctx[2]);
    			attr_dev(path, "d", "M81.5,6 C69.8240666,23.5139001 45.8240666,49.9277635 9.5,85.2415902\n        C45.7984814,120.80686 69.7984814,147.22633 81.5,164.5");
    			attr_dev(path, "stroke", /*color*/ ctx[3]);
    			attr_dev(path, "stroke-width", "20");
    			attr_dev(path, "fill-rule", "nonzero");
    			add_location(path, file, 11, 8, 323);
    			attr_dev(g, "stroke", "none");
    			attr_dev(g, "stroke-width", "1");
    			attr_dev(g, "fill", "none");
    			attr_dev(g, "fill-rule", "evenodd");
    			attr_dev(g, "stroke-linejoin", "round");
    			add_location(g, file, 10, 6, 224);
    			attr_dev(svg, "width", "15px");
    			attr_dev(svg, "height", "30px");
    			attr_dev(svg, "viewBox", "0 0 90 170");
    			add_location(svg, file, 9, 4, 164);
    			attr_dev(a, "href", /*href*/ ctx[0]);
    			add_location(a, file, 8, 2, 149);
    			attr_dev(div0, "class", "goleft svelte-2kl8gv");
    			add_location(div0, file, 7, 0, 126);
    			attr_dev(div1, "class", "title svelte-2kl8gv");
    			add_location(div1, file, 23, 2, 628);
    			attr_dev(div2, "class", "sub svelte-2kl8gv");
    			add_location(div2, file, 24, 2, 669);
    			attr_dev(div3, "class", "titlebox svelte-2kl8gv");
    			add_location(div3, file, 22, 0, 603);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div0, anchor);
    			append_dev(div0, a);
    			append_dev(a, svg);
    			append_dev(svg, g);
    			append_dev(g, path);
    			insert_dev(target, t0, anchor);
    			insert_dev(target, div3, anchor);
    			append_dev(div3, div1);
    			div1.innerHTML = /*title*/ ctx[1];
    			append_dev(div3, t1);
    			append_dev(div3, div2);
    			append_dev(div2, t2);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*color*/ 8) {
    				attr_dev(path, "stroke", /*color*/ ctx[3]);
    			}

    			if (dirty & /*href*/ 1) {
    				attr_dev(a, "href", /*href*/ ctx[0]);
    			}

    			if (dirty & /*title*/ 2) div1.innerHTML = /*title*/ ctx[1];			if (dirty & /*sub*/ 4) set_data_dev(t2, /*sub*/ ctx[2]);
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div0);
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(div3);
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
    	let { href = "../../" } = $$props;
    	let { title = "" } = $$props;
    	let { sub = "" } = $$props;
    	let { color = "#769bb5" } = $$props;
    	const writable_props = ["href", "title", "sub", "color"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Head> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("href" in $$props) $$invalidate(0, href = $$props.href);
    		if ("title" in $$props) $$invalidate(1, title = $$props.title);
    		if ("sub" in $$props) $$invalidate(2, sub = $$props.sub);
    		if ("color" in $$props) $$invalidate(3, color = $$props.color);
    	};

    	$$self.$capture_state = () => ({ href, title, sub, color });

    	$$self.$inject_state = $$props => {
    		if ("href" in $$props) $$invalidate(0, href = $$props.href);
    		if ("title" in $$props) $$invalidate(1, title = $$props.title);
    		if ("sub" in $$props) $$invalidate(2, sub = $$props.sub);
    		if ("color" in $$props) $$invalidate(3, color = $$props.color);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [href, title, sub, color];
    }

    class Head extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		if (!document.getElementById("svelte-2kl8gv-style")) add_css();
    		init(this, options, instance, create_fragment, safe_not_equal, { href: 0, title: 1, sub: 2, color: 3 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Head",
    			options,
    			id: create_fragment.name
    		});
    	}

    	get href() {
    		throw new Error("<Head>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set href(value) {
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

    	get color() {
    		throw new Error("<Head>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set color(value) {
    		throw new Error("<Head>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* components/Foot.svelte generated by Svelte v3.29.0 */

    const file$1 = "components/Foot.svelte";

    function add_css$1() {
    	var style = element("style");
    	style.id = "svelte-1a507ff-style";
    	style.textContent = ".footer.svelte-1a507ff{display:flex;margin:auto 1rem 1rem auto;padding:0.5rem;justify-content:flex-end;align-content:flex-end;align-items:center;padding-top:1rem;width:100%;font-size:0.8rem}.m2.svelte-1a507ff{margin:1.5rem}.link.svelte-1a507ff{color:#769bb5;cursor:pointer;text-decoration:none}a.svelte-1a507ff:hover{text-decoration-color:#cc7066}.name.svelte-1a507ff{margin-right:2rem}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRm9vdC5zdmVsdGUiLCJzb3VyY2VzIjpbIkZvb3Quc3ZlbHRlIl0sInNvdXJjZXNDb250ZW50IjpbIjxzY3JpcHQ+XG4gIGV4cG9ydCBsZXQgdGl0bGUgPSAnJ1xuICBleHBvcnQgbGV0IHllYXIgPSAnJ1xuICBsZXQgdXJsID0gJ2h0dHBzOi8vZ2l0aHViLmNvbS9zcGVuY2VybW91bnRhaW4vdGhlbnNvbWUnXG4gIGlmICh0aXRsZSAmJiB5ZWFyKSB7XG4gICAgdXJsICs9IGAvdHJlZS9naC1wYWdlcy8ke3llYXJ9LyR7dGl0bGV9YFxuICB9XG48L3NjcmlwdD5cblxuPCEtLSBmb290ZXIgLS0+XG48ZGl2IGNsYXNzPVwiZm9vdGVyXCI+XG4gIDxhIGNsYXNzPVwibGluayBtMlwiIGhyZWY9e3VybH0+c291cmNlPC9hPlxuICA8YSBjbGFzcz1cImxpbmsgbmFtZVwiIGhyZWY9XCJodHRwOi8vdHdpdHRlci5jb20vc3BlbmNlcm1vdW50YWluL1wiPkBzcGVuY2VybW91bnRhaW48L2E+XG48L2Rpdj5cblxuPHN0eWxlPlxuICAuZm9vdGVyIHtcbiAgICBkaXNwbGF5OiBmbGV4O1xuICAgIG1hcmdpbjogYXV0byAxcmVtIDFyZW0gYXV0bztcbiAgICBwYWRkaW5nOiAwLjVyZW07XG4gICAganVzdGlmeS1jb250ZW50OiBmbGV4LWVuZDtcbiAgICBhbGlnbi1jb250ZW50OiBmbGV4LWVuZDtcbiAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgIHBhZGRpbmctdG9wOiAxcmVtO1xuICAgIHdpZHRoOiAxMDAlO1xuICAgIGZvbnQtc2l6ZTogMC44cmVtO1xuICB9XG4gIC5tMiB7XG4gICAgbWFyZ2luOiAxLjVyZW07XG4gIH1cbiAgLmxpbmsge1xuICAgIGNvbG9yOiAjNzY5YmI1O1xuICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICB0ZXh0LWRlY29yYXRpb246IG5vbmU7XG4gIH1cbiAgYTpob3ZlciB7XG4gICAgdGV4dC1kZWNvcmF0aW9uLWNvbG9yOiAjY2M3MDY2O1xuICB9XG4gIC5uYW1lIHtcbiAgICBtYXJnaW4tcmlnaHQ6IDJyZW07XG4gIH1cbjwvc3R5bGU+XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBZ0JFLE9BQU8sZUFBQyxDQUFDLEFBQ1AsT0FBTyxDQUFFLElBQUksQ0FDYixNQUFNLENBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUMzQixPQUFPLENBQUUsTUFBTSxDQUNmLGVBQWUsQ0FBRSxRQUFRLENBQ3pCLGFBQWEsQ0FBRSxRQUFRLENBQ3ZCLFdBQVcsQ0FBRSxNQUFNLENBQ25CLFdBQVcsQ0FBRSxJQUFJLENBQ2pCLEtBQUssQ0FBRSxJQUFJLENBQ1gsU0FBUyxDQUFFLE1BQU0sQUFDbkIsQ0FBQyxBQUNELEdBQUcsZUFBQyxDQUFDLEFBQ0gsTUFBTSxDQUFFLE1BQU0sQUFDaEIsQ0FBQyxBQUNELEtBQUssZUFBQyxDQUFDLEFBQ0wsS0FBSyxDQUFFLE9BQU8sQ0FDZCxNQUFNLENBQUUsT0FBTyxDQUNmLGVBQWUsQ0FBRSxJQUFJLEFBQ3ZCLENBQUMsQUFDRCxnQkFBQyxNQUFNLEFBQUMsQ0FBQyxBQUNQLHFCQUFxQixDQUFFLE9BQU8sQUFDaEMsQ0FBQyxBQUNELEtBQUssZUFBQyxDQUFDLEFBQ0wsWUFBWSxDQUFFLElBQUksQUFDcEIsQ0FBQyJ9 */";
    	append_dev(document.head, style);
    }

    function create_fragment$1(ctx) {
    	let div;
    	let a0;
    	let t0;
    	let t1;
    	let a1;

    	const block = {
    		c: function create() {
    			div = element("div");
    			a0 = element("a");
    			t0 = text("source");
    			t1 = space();
    			a1 = element("a");
    			a1.textContent = "@spencermountain";
    			attr_dev(a0, "class", "link m2 svelte-1a507ff");
    			attr_dev(a0, "href", /*url*/ ctx[0]);
    			add_location(a0, file$1, 11, 2, 236);
    			attr_dev(a1, "class", "link name svelte-1a507ff");
    			attr_dev(a1, "href", "http://twitter.com/spencermountain/");
    			add_location(a1, file$1, 12, 2, 279);
    			attr_dev(div, "class", "footer svelte-1a507ff");
    			add_location(div, file$1, 10, 0, 213);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, a0);
    			append_dev(a0, t0);
    			append_dev(div, t1);
    			append_dev(div, a1);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*url*/ 1) {
    				attr_dev(a0, "href", /*url*/ ctx[0]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
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
    	let { title = "" } = $$props;
    	let { year = "" } = $$props;
    	let url = "https://github.com/spencermountain/thensome";

    	if (title && year) {
    		url += `/tree/gh-pages/${year}/${title}`;
    	}

    	const writable_props = ["title", "year"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Foot> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("title" in $$props) $$invalidate(1, title = $$props.title);
    		if ("year" in $$props) $$invalidate(2, year = $$props.year);
    	};

    	$$self.$capture_state = () => ({ title, year, url });

    	$$self.$inject_state = $$props => {
    		if ("title" in $$props) $$invalidate(1, title = $$props.title);
    		if ("year" in $$props) $$invalidate(2, year = $$props.year);
    		if ("url" in $$props) $$invalidate(0, url = $$props.url);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [url, title, year];
    }

    class Foot extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		if (!document.getElementById("svelte-1a507ff-style")) add_css$1();
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { title: 1, year: 2 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Foot",
    			options,
    			id: create_fragment$1.name
    		});
    	}

    	get title() {
    		throw new Error("<Foot>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set title(value) {
    		throw new Error("<Foot>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get year() {
    		throw new Error("<Foot>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set year(value) {
    		throw new Error("<Foot>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* components/Page.svelte generated by Svelte v3.29.0 */
    const file$2 = "components/Page.svelte";

    function add_css$2() {
    	var style = element("style");
    	style.id = "svelte-juw3t5-style";
    	style.textContent = ".page.svelte-juw3t5{display:flex;flex-direction:column;justify-content:space-around;align-items:center;text-align:center}.grow.svelte-juw3t5{width:90%}.mid.svelte-juw3t5{margin:1rem;padding:1rem;margin-top:0rem;min-width:300px;flex-grow:1}.shadow.svelte-juw3t5{padding:2rem;min-height:300px;box-shadow:2px 2px 8px 0px rgba(0, 0, 0, 0.2)}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUGFnZS5zdmVsdGUiLCJzb3VyY2VzIjpbIlBhZ2Uuc3ZlbHRlIl0sInNvdXJjZXNDb250ZW50IjpbIjxzY3JpcHQ+XG4gIGltcG9ydCBIZWFkIGZyb20gJy4vSGVhZC5zdmVsdGUnXG4gIGltcG9ydCBGb290IGZyb20gJy4vRm9vdC5zdmVsdGUnXG4gIGV4cG9ydCBsZXQgdGl0bGUgPSAnJ1xuICBleHBvcnQgbGV0IHN1YiA9ICcnXG4gIGV4cG9ydCBsZXQgZ3JvdyA9IGZhbHNlXG4gIGV4cG9ydCBsZXQgbWF4ID0gMTUwMFxuICBleHBvcnQgbGV0IG1pbiA9IDBcbiAgZXhwb3J0IGxldCBwYWRkaW5nID0gMTZcbiAgZXhwb3J0IGxldCB5ZWFyID0gU3RyaW5nKG5ldyBEYXRlKCkuZ2V0RnVsbFllYXIoKSlcbjwvc2NyaXB0PlxuXG48ZGl2IGNsYXNzPVwicGFnZVwiPlxuICA8SGVhZCB7dGl0bGV9IHtzdWJ9IC8+XG4gIDxkaXYgY2xhc3M9XCJtaWRcIiBjbGFzczpncm93IHN0eWxlPVwibWF4LXdpZHRoOnttYXh9cHg7IG1pbi13aWR0aDp7bWlufXB4O1wiPlxuICAgIDxkaXYgY2xhc3M9XCJzaGFkb3dcIiBzdHlsZT1cInBhZGRpbmc6e3BhZGRpbmd9cHg7XCI+XG4gICAgICA8c2xvdCAvPlxuICAgIDwvZGl2PlxuICAgIDxGb290IHt0aXRsZX0ge3llYXJ9IC8+XG4gIDwvZGl2PlxuPC9kaXY+XG5cbjxzdHlsZT5cbiAgLyogZXZlcnl0aGluZyAqL1xuICAucGFnZSB7XG4gICAgZGlzcGxheTogZmxleDtcbiAgICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuICAgIGp1c3RpZnktY29udGVudDogc3BhY2UtYXJvdW5kO1xuICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgdGV4dC1hbGlnbjogY2VudGVyO1xuICB9XG4gIC5ncm93IHtcbiAgICB3aWR0aDogOTAlO1xuICB9XG5cbiAgLyogaW52aXNpYmxlLW1pZGRsZS1jb2x1bW4gKi9cbiAgLm1pZCB7XG4gICAgbWFyZ2luOiAxcmVtO1xuICAgIHBhZGRpbmc6IDFyZW07XG4gICAgbWFyZ2luLXRvcDogMHJlbTtcbiAgICBtaW4td2lkdGg6IDMwMHB4O1xuICAgIGZsZXgtZ3JvdzogMTtcbiAgfVxuXG4gIC8qIHZpc2libGUgbWlkZGxlLWNvbHVtbiAqL1xuICAuc2hhZG93IHtcbiAgICBwYWRkaW5nOiAycmVtO1xuICAgIG1pbi1oZWlnaHQ6IDMwMHB4O1xuICAgIGJveC1zaGFkb3c6IDJweCAycHggOHB4IDBweCByZ2JhKDAsIDAsIDAsIDAuMik7XG4gIH1cbjwvc3R5bGU+XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBd0JFLEtBQUssY0FBQyxDQUFDLEFBQ0wsT0FBTyxDQUFFLElBQUksQ0FDYixjQUFjLENBQUUsTUFBTSxDQUN0QixlQUFlLENBQUUsWUFBWSxDQUM3QixXQUFXLENBQUUsTUFBTSxDQUNuQixVQUFVLENBQUUsTUFBTSxBQUNwQixDQUFDLEFBQ0QsS0FBSyxjQUFDLENBQUMsQUFDTCxLQUFLLENBQUUsR0FBRyxBQUNaLENBQUMsQUFHRCxJQUFJLGNBQUMsQ0FBQyxBQUNKLE1BQU0sQ0FBRSxJQUFJLENBQ1osT0FBTyxDQUFFLElBQUksQ0FDYixVQUFVLENBQUUsSUFBSSxDQUNoQixTQUFTLENBQUUsS0FBSyxDQUNoQixTQUFTLENBQUUsQ0FBQyxBQUNkLENBQUMsQUFHRCxPQUFPLGNBQUMsQ0FBQyxBQUNQLE9BQU8sQ0FBRSxJQUFJLENBQ2IsVUFBVSxDQUFFLEtBQUssQ0FDakIsVUFBVSxDQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxBQUNoRCxDQUFDIn0= */";
    	append_dev(document.head, style);
    }

    function create_fragment$2(ctx) {
    	let div2;
    	let head;
    	let t0;
    	let div1;
    	let div0;
    	let t1;
    	let foot;
    	let current;

    	head = new Head({
    			props: {
    				title: /*title*/ ctx[0],
    				sub: /*sub*/ ctx[1]
    			},
    			$$inline: true
    		});

    	const default_slot_template = /*#slots*/ ctx[8].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[7], null);

    	foot = new Foot({
    			props: {
    				title: /*title*/ ctx[0],
    				year: /*year*/ ctx[6]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			div2 = element("div");
    			create_component(head.$$.fragment);
    			t0 = space();
    			div1 = element("div");
    			div0 = element("div");
    			if (default_slot) default_slot.c();
    			t1 = space();
    			create_component(foot.$$.fragment);
    			attr_dev(div0, "class", "shadow svelte-juw3t5");
    			set_style(div0, "padding", /*padding*/ ctx[5] + "px");
    			add_location(div0, file$2, 15, 4, 411);
    			attr_dev(div1, "class", "mid svelte-juw3t5");
    			set_style(div1, "max-width", /*max*/ ctx[3] + "px");
    			set_style(div1, "min-width", /*min*/ ctx[4] + "px");
    			toggle_class(div1, "grow", /*grow*/ ctx[2]);
    			add_location(div1, file$2, 14, 2, 332);
    			attr_dev(div2, "class", "page svelte-juw3t5");
    			add_location(div2, file$2, 12, 0, 286);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div2, anchor);
    			mount_component(head, div2, null);
    			append_dev(div2, t0);
    			append_dev(div2, div1);
    			append_dev(div1, div0);

    			if (default_slot) {
    				default_slot.m(div0, null);
    			}

    			append_dev(div1, t1);
    			mount_component(foot, div1, null);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const head_changes = {};
    			if (dirty & /*title*/ 1) head_changes.title = /*title*/ ctx[0];
    			if (dirty & /*sub*/ 2) head_changes.sub = /*sub*/ ctx[1];
    			head.$set(head_changes);

    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 128) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[7], dirty, null, null);
    				}
    			}

    			if (!current || dirty & /*padding*/ 32) {
    				set_style(div0, "padding", /*padding*/ ctx[5] + "px");
    			}

    			const foot_changes = {};
    			if (dirty & /*title*/ 1) foot_changes.title = /*title*/ ctx[0];
    			if (dirty & /*year*/ 64) foot_changes.year = /*year*/ ctx[6];
    			foot.$set(foot_changes);

    			if (!current || dirty & /*max*/ 8) {
    				set_style(div1, "max-width", /*max*/ ctx[3] + "px");
    			}

    			if (!current || dirty & /*min*/ 16) {
    				set_style(div1, "min-width", /*min*/ ctx[4] + "px");
    			}

    			if (dirty & /*grow*/ 4) {
    				toggle_class(div1, "grow", /*grow*/ ctx[2]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(head.$$.fragment, local);
    			transition_in(default_slot, local);
    			transition_in(foot.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(head.$$.fragment, local);
    			transition_out(default_slot, local);
    			transition_out(foot.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div2);
    			destroy_component(head);
    			if (default_slot) default_slot.d(detaching);
    			destroy_component(foot);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Page", slots, ['default']);
    	let { title = "" } = $$props;
    	let { sub = "" } = $$props;
    	let { grow = false } = $$props;
    	let { max = 1500 } = $$props;
    	let { min = 0 } = $$props;
    	let { padding = 16 } = $$props;
    	let { year = String(new Date().getFullYear()) } = $$props;
    	const writable_props = ["title", "sub", "grow", "max", "min", "padding", "year"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Page> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("title" in $$props) $$invalidate(0, title = $$props.title);
    		if ("sub" in $$props) $$invalidate(1, sub = $$props.sub);
    		if ("grow" in $$props) $$invalidate(2, grow = $$props.grow);
    		if ("max" in $$props) $$invalidate(3, max = $$props.max);
    		if ("min" in $$props) $$invalidate(4, min = $$props.min);
    		if ("padding" in $$props) $$invalidate(5, padding = $$props.padding);
    		if ("year" in $$props) $$invalidate(6, year = $$props.year);
    		if ("$$scope" in $$props) $$invalidate(7, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		Head,
    		Foot,
    		title,
    		sub,
    		grow,
    		max,
    		min,
    		padding,
    		year
    	});

    	$$self.$inject_state = $$props => {
    		if ("title" in $$props) $$invalidate(0, title = $$props.title);
    		if ("sub" in $$props) $$invalidate(1, sub = $$props.sub);
    		if ("grow" in $$props) $$invalidate(2, grow = $$props.grow);
    		if ("max" in $$props) $$invalidate(3, max = $$props.max);
    		if ("min" in $$props) $$invalidate(4, min = $$props.min);
    		if ("padding" in $$props) $$invalidate(5, padding = $$props.padding);
    		if ("year" in $$props) $$invalidate(6, year = $$props.year);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [title, sub, grow, max, min, padding, year, $$scope, slots];
    }

    class Page extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		if (!document.getElementById("svelte-juw3t5-style")) add_css$2();

    		init(this, options, instance$2, create_fragment$2, safe_not_equal, {
    			title: 0,
    			sub: 1,
    			grow: 2,
    			max: 3,
    			min: 4,
    			padding: 5,
    			year: 6
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Page",
    			options,
    			id: create_fragment$2.name
    		});
    	}

    	get title() {
    		throw new Error("<Page>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set title(value) {
    		throw new Error("<Page>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get sub() {
    		throw new Error("<Page>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set sub(value) {
    		throw new Error("<Page>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get grow() {
    		throw new Error("<Page>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set grow(value) {
    		throw new Error("<Page>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get max() {
    		throw new Error("<Page>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set max(value) {
    		throw new Error("<Page>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get min() {
    		throw new Error("<Page>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set min(value) {
    		throw new Error("<Page>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get padding() {
    		throw new Error("<Page>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set padding(value) {
    		throw new Error("<Page>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get year() {
    		throw new Error("<Page>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set year(value) {
    		throw new Error("<Page>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    const MSEC_IN_HOUR = 60 * 60 * 1000;

    //convert our local date syntax a javascript UTC date
    const toUtc = (dstChange, offset, year) => {
      const [month, rest] = dstChange.split('/');
      const [day, hour] = rest.split(':');
      return Date.UTC(year, month - 1, day, hour) - offset * MSEC_IN_HOUR
    };

    // compare epoch with dst change events (in utc)
    const inSummerTime = (epoch, start, end, summerOffset, winterOffset) => {
      const year = new Date(epoch).getUTCFullYear();
      const startUtc = toUtc(start, winterOffset, year);
      const endUtc = toUtc(end, summerOffset, year);
      // simple number comparison now
      return epoch >= startUtc && epoch < endUtc
    };

    // this method avoids having to do a full dst-calculation on every operation
    // it reproduces some things in ./index.js, but speeds up spacetime considerably
    const quickOffset = s => {
      let zones = s.timezones;
      let obj = zones[s.tz];
      if (obj === undefined) {
        console.warn("Warning: couldn't find timezone " + s.tz);
        return 0
      }
      if (obj.dst === undefined) {
        return obj.offset
      }

      //get our two possible offsets
      let jul = obj.offset;
      let dec = obj.offset + 1; // assume it's the same for now
      if (obj.hem === 'n') {
        dec = jul - 1;
      }
      let split = obj.dst.split('->');
      let inSummer = inSummerTime(s.epoch, split[0], split[1], jul, dec);
      if (inSummer === true) {
        return jul
      }
      return dec
    };

    var data = {
      "9|s": "2/dili,2/jayapura",
      "9|n": "2/chita,2/khandyga,2/pyongyang,2/seoul,2/tokyo,11/palau,japan,rok",
      "9.5|s|04/03:03->10/02:02": "4/adelaide,4/broken_hill,4/south,4/yancowinna",
      "9.5|s": "4/darwin,4/north",
      "8|s|03/08:01->10/04:00": "12/casey",
      "8|s": "2/kuala_lumpur,2/makassar,2/singapore,4/perth,2/ujung_pandang,4/west,singapore",
      "8|n": "2/brunei,2/choibalsan,2/hong_kong,2/irkutsk,2/kuching,2/macau,2/manila,2/shanghai,2/taipei,2/ulaanbaatar,2/chongqing,2/chungking,2/harbin,2/macao,2/ulan_bator,hongkong,prc,roc",
      "8.75|s": "4/eucla",
      "7|s": "12/davis,2/jakarta,9/christmas",
      "7|n": "2/bangkok,2/barnaul,2/hovd,2/krasnoyarsk,2/novokuznetsk,2/novosibirsk,2/phnom_penh,2/pontianak,2/ho_chi_minh,2/tomsk,2/vientiane,2/saigon",
      "6|s": "12/vostok",
      "6|n": "2/almaty,2/bishkek,2/dhaka,2/omsk,2/qyzylorda,2/qostanay,2/thimphu,2/urumqi,9/chagos,2/dacca,2/kashgar,2/thimbu",
      "6.5|n": "2/yangon,9/cocos,2/rangoon",
      "5|s": "12/mawson,9/kerguelen",
      "5|n": "2/aqtau,2/aqtobe,2/ashgabat,2/atyrau,2/dushanbe,2/karachi,2/oral,2/samarkand,2/tashkent,2/yekaterinburg,9/maldives,2/ashkhabad",
      "5.75|n": "2/katmandu,2/kathmandu",
      "5.5|n": "2/kolkata,2/colombo,2/calcutta",
      "4|s": "9/reunion",
      "4|n": "2/baku,2/dubai,2/muscat,2/tbilisi,2/yerevan,8/astrakhan,8/samara,8/saratov,8/ulyanovsk,8/volgograd,2/volgograd,9/mahe,9/mauritius",
      "4.5|n|03/22:00->09/21:24": "2/tehran,iran",
      "4.5|n": "2/kabul",
      "3|s": "12/syowa,9/antananarivo",
      "3|n|03/27:03->10/30:04": "2/famagusta,2/nicosia,8/athens,8/bucharest,8/helsinki,8/kiev,8/mariehamn,8/riga,8/sofia,8/tallinn,8/uzhgorod,8/vilnius,8/zaporozhye,8/nicosia",
      "3|n|03/27:02->10/30:03": "8/chisinau,8/tiraspol",
      "3|n|03/27:00->10/29:24": "2/beirut",
      "3|n|03/26:00->10/28:01": "2/gaza,2/hebron",
      "3|n|03/25:02->10/30:02": "2/jerusalem,2/tel_aviv,israel",
      "3|n|03/25:00->10/27:24": "2/damascus",
      "3|n|02/25:00->10/28:01": "2/amman",
      "3|n": "0/addis_ababa,0/asmara,0/asmera,0/dar_es_salaam,0/djibouti,0/juba,0/kampala,0/mogadishu,0/nairobi,2/aden,2/baghdad,2/bahrain,2/kuwait,2/qatar,2/riyadh,8/istanbul,8/kirov,8/minsk,8/moscow,8/simferopol,9/comoro,9/mayotte,2/istanbul,turkey,w-su",
      "2|s|03/27:02->10/30:02": "12/troll",
      "2|s": "0/gaborone,0/harare,0/johannesburg,0/lubumbashi,0/lusaka,0/maputo,0/maseru,0/mbabane",
      "2|n|03/27:02->10/30:03": "0/ceuta,arctic/longyearbyen,8/amsterdam,8/andorra,8/belgrade,8/berlin,8/bratislava,8/brussels,8/budapest,8/busingen,8/copenhagen,8/gibraltar,8/ljubljana,8/luxembourg,8/madrid,8/malta,8/monaco,8/oslo,8/paris,8/podgorica,8/prague,8/rome,8/san_marino,8/sarajevo,8/skopje,8/stockholm,8/tirane,8/vaduz,8/vatican,8/vienna,8/warsaw,8/zagreb,8/zurich,3/jan_mayen,poland",
      "2|n": "0/blantyre,0/bujumbura,0/cairo,0/khartoum,0/kigali,0/tripoli,8/kaliningrad,egypt,libya",
      "1|s": "0/brazzaville,0/kinshasa,0/luanda,0/windhoek",
      "1|n|03/27:03->05/08:02": "0/casablanca,0/el_aaiun",
      "1|n|03/27:01->10/30:02": "3/canary,3/faroe,3/madeira,8/dublin,8/guernsey,8/isle_of_man,8/jersey,8/lisbon,8/london,3/faeroe,eire,8/belfast,gb-eire,gb,portugal",
      "1|n": "0/algiers,0/bangui,0/douala,0/lagos,0/libreville,0/malabo,0/ndjamena,0/niamey,0/porto-novo,0/tunis",
      "14|n": "11/kiritimati",
      "13|s|04/04:04->09/26:03": "11/apia",
      "13|s|01/15:02->11/05:03": "11/tongatapu",
      "13|n": "11/enderbury,11/fakaofo",
      "12|s|04/03:03->09/25:02": "12/mcmurdo,11/auckland,12/south_pole,nz",
      "12|s|01/17:03->11/14:02": "11/fiji",
      "12|n": "2/anadyr,2/kamchatka,2/srednekolymsk,11/funafuti,11/kwajalein,11/majuro,11/nauru,11/tarawa,11/wake,11/wallis,kwajalein",
      "12.75|s|04/03:03->04/03:02": "11/chatham,nz-chat",
      "11|s|04/03:03->10/02:02": "12/macquarie",
      "11|s": "11/bougainville",
      "11|n": "2/magadan,2/sakhalin,11/efate,11/guadalcanal,11/kosrae,11/noumea,11/pohnpei,11/ponape",
      "11.5|n|04/03:03->10/02:02": "11/norfolk",
      "10|s|04/03:03->10/02:02": "4/currie,4/hobart,4/melbourne,4/sydney,4/act,4/canberra,4/nsw,4/tasmania,4/victoria",
      "10|s": "12/dumontdurville,4/brisbane,4/lindeman,11/port_moresby,4/queensland",
      "10|n": "2/ust-nera,2/vladivostok,2/yakutsk,11/guam,11/saipan,11/chuuk,11/truk,11/yap",
      "10.5|s|04/03:01->10/02:02": "4/lord_howe,4/lhi",
      "0|n|03/27:00->10/30:01": "1/scoresbysund,3/azores",
      "0|n": "0/abidjan,0/accra,0/bamako,0/banjul,0/bissau,0/conakry,0/dakar,0/freetown,0/lome,0/monrovia,0/nouakchott,0/ouagadougou,0/sao_tome,1/danmarkshavn,3/reykjavik,3/st_helena,13/gmt,13/utc,0/timbuktu,13/greenwich,13/uct,13/universal,13/zulu,gmt-0,gmt+0,gmt0,greenwich,iceland,uct,universal,utc,zulu",
      "-9|n|03/13:02->11/06:02": "1/adak,1/atka,us/aleutian",
      "-9|n": "11/gambier",
      "-9.5|n": "11/marquesas",
      "-8|n|03/13:02->11/06:02": "1/anchorage,1/juneau,1/metlakatla,1/nome,1/sitka,1/yakutat,us/alaska",
      "-8|n": "11/pitcairn",
      "-7|n|03/13:02->11/06:02": "1/los_angeles,1/santa_isabel,1/tijuana,1/vancouver,1/ensenada,6/pacific,10/bajanorte,us/pacific-new,us/pacific",
      "-7|n|03/08:02->11/01:01": "1/dawson,1/whitehorse,6/yukon",
      "-7|n": "1/creston,1/dawson_creek,1/fort_nelson,1/hermosillo,1/phoenix,us/arizona",
      "-6|s|04/02:22->09/03:22": "11/easter,7/easterisland",
      "-6|n|04/03:02->10/30:02": "1/chihuahua,1/mazatlan,10/bajasur",
      "-6|n|03/13:02->11/06:02": "1/boise,1/cambridge_bay,1/denver,1/edmonton,1/inuvik,1/ojinaga,1/yellowknife,1/shiprock,6/mountain,navajo,us/mountain",
      "-6|n": "1/belize,1/costa_rica,1/el_salvador,1/guatemala,1/managua,1/regina,1/swift_current,1/tegucigalpa,11/galapagos,6/east-saskatchewan,6/saskatchewan",
      "-5|s": "1/lima,1/rio_branco,1/porto_acre,5/acre",
      "-5|n|04/03:02->10/30:02": "1/bahia_banderas,1/merida,1/mexico_city,1/monterrey,10/general",
      "-5|n|03/13:02->11/06:02": "1/chicago,1/matamoros,1/menominee,1/rainy_river,1/rankin_inlet,1/resolute,1/winnipeg,1/indiana/knox,1/indiana/tell_city,1/north_dakota/beulah,1/north_dakota/center,1/north_dakota/new_salem,1/knox_in,6/central,us/central,us/indiana-starke",
      "-5|n|03/12:03->11/05:01": "1/north_dakota",
      "-5|n": "1/bogota,1/cancun,1/cayman,1/coral_harbour,1/eirunepe,1/guayaquil,1/jamaica,1/panama,1/atikokan,jamaica",
      "-4|s|05/13:23->08/13:01": "12/palmer",
      "-4|s|04/02:24->09/04:00": "1/santiago,7/continental",
      "-4|s|03/26:24->10/02:00": "1/asuncion",
      "-4|s|02/16:24->11/03:00": "1/campo_grande,1/cuiaba",
      "-4|s": "1/la_paz,1/manaus,5/west",
      "-4|n|03/13:02->11/06:02": "1/detroit,1/grand_turk,1/indianapolis,1/iqaluit,1/louisville,1/montreal,1/nassau,1/new_york,1/nipigon,1/pangnirtung,1/port-au-prince,1/thunder_bay,1/toronto,1/indiana/marengo,1/indiana/petersburg,1/indiana/vevay,1/indiana/vincennes,1/indiana/winamac,1/kentucky/monticello,1/fort_wayne,1/indiana/indianapolis,1/kentucky/louisville,6/eastern,us/east-indiana,us/eastern,us/michigan",
      "-4|n|03/13:00->11/06:01": "1/havana,cuba",
      "-4|n|03/12:03->11/05:01": "1/indiana,1/kentucky",
      "-4|n": "1/anguilla,1/antigua,1/aruba,1/barbados,1/blanc-sablon,1/boa_vista,1/caracas,1/curacao,1/dominica,1/grenada,1/guadeloupe,1/guyana,1/kralendijk,1/lower_princes,1/marigot,1/martinique,1/montserrat,1/port_of_spain,1/porto_velho,1/puerto_rico,1/santo_domingo,1/st_barthelemy,1/st_kitts,1/st_lucia,1/st_thomas,1/st_vincent,1/tortola,1/virgin",
      "-3|s": "1/argentina,1/buenos_aires,1/catamarca,1/cordoba,1/fortaleza,1/jujuy,1/mendoza,1/montevideo,1/punta_arenas,1/sao_paulo,12/rothera,3/stanley,1/argentina/la_rioja,1/argentina/rio_gallegos,1/argentina/salta,1/argentina/san_juan,1/argentina/san_luis,1/argentina/tucuman,1/argentina/ushuaia,1/argentina/comodrivadavia,1/argentina/buenos_aires,1/argentina/catamarca,1/argentina/cordoba,1/argentina/jujuy,1/argentina/mendoza,1/argentina/rosario,1/rosario,5/east",
      "-3|n|03/13:02->11/06:02": "1/glace_bay,1/goose_bay,1/halifax,1/moncton,1/thule,3/bermuda,6/atlantic",
      "-3|n": "1/araguaina,1/bahia,1/belem,1/cayenne,1/maceio,1/paramaribo,1/recife,1/santarem",
      "-2|n|03/26:22->10/29:23": "1/nuuk,1/godthab",
      "-2|n|03/13:02->11/06:02": "1/miquelon",
      "-2|n": "1/noronha,3/south_georgia,5/denoronha",
      "-2.5|n|03/13:02->11/06:02": "1/st_johns,6/newfoundland",
      "-1|n": "3/cape_verde",
      "-11|n": "11/midway,11/niue,11/pago_pago,11/samoa,us/samoa",
      "-10|n": "11/honolulu,11/johnston,11/rarotonga,11/tahiti,us/hawaii"
    };

    //prefixes for iana names..
    var prefixes = [
      'africa',
      'america',
      'asia',
      'atlantic',
      'australia',
      'brazil',
      'canada',
      'chile',
      'europe',
      'indian',
      'mexico',
      'pacific',
      'antarctica',
      'etc'
    ];

    let all = {};
    Object.keys(data).forEach((k) => {
      let split = k.split('|');
      let obj = {
        offset: Number(split[0]),
        hem: split[1]
      };
      if (split[2]) {
        obj.dst = split[2];
      }
      let names = data[k].split(',');
      names.forEach((str) => {
        str = str.replace(/(^[0-9]+)\//, (before, num) => {
          num = Number(num);
          return prefixes[num] + '/'
        });
        all[str] = obj;
      });
    });

    all.utc = {
      offset: 0,
      hem: 'n' //default to northern hemisphere - (sorry!)
    };

    //add etc/gmt+n
    for (let i = -14; i <= 14; i += 0.5) {
      let num = i;
      if (num > 0) {
        num = '+' + num;
      }
      let name = 'etc/gmt' + num;
      all[name] = {
        offset: i * -1, //they're negative!
        hem: 'n' //(sorry)
      };
      name = 'utc/gmt' + num; //this one too, why not.
      all[name] = {
        offset: i * -1,
        hem: 'n'
      };
    }

    //find the implicit iana code for this machine.
    //safely query the Intl object
    //based on - https://bitbucket.org/pellepim/jstimezonedetect/src
    const fallbackTZ = 'utc'; //

    //this Intl object is not supported often, yet
    const safeIntl = () => {
      if (typeof Intl === 'undefined' || typeof Intl.DateTimeFormat === 'undefined') {
        return null
      }
      let format = Intl.DateTimeFormat();
      if (typeof format === 'undefined' || typeof format.resolvedOptions === 'undefined') {
        return null
      }
      let timezone = format.resolvedOptions().timeZone;
      if (!timezone) {
        return null
      }
      return timezone.toLowerCase()
    };

    const guessTz = () => {
      let timezone = safeIntl();
      if (timezone === null) {
        return fallbackTZ
      }
      return timezone
    };

    const isOffset = /(\-?[0-9]+)h(rs)?/i;
    const isNumber = /(\-?[0-9]+)/;
    const utcOffset = /utc([\-+]?[0-9]+)/i;
    const gmtOffset = /gmt([\-+]?[0-9]+)/i;

    const toIana = function (num) {
      num = Number(num);
      if (num >= -13 && num <= 13) {
        num = num * -1; //it's opposite!
        num = (num > 0 ? '+' : '') + num; //add plus sign
        return 'etc/gmt' + num
      }
      return null
    };

    const parseOffset = function (tz) {
      // '+5hrs'
      let m = tz.match(isOffset);
      if (m !== null) {
        return toIana(m[1])
      }
      // 'utc+5'
      m = tz.match(utcOffset);
      if (m !== null) {
        return toIana(m[1])
      }
      // 'GMT-5' (not opposite)
      m = tz.match(gmtOffset);
      if (m !== null) {
        let num = Number(m[1]) * -1;
        return toIana(num)
      }
      // '+5'
      m = tz.match(isNumber);
      if (m !== null) {
        return toIana(m[1])
      }
      return null
    };

    const local = guessTz();

    //add all the city names by themselves
    const cities = Object.keys(all).reduce((h, k) => {
      let city = k.split('/')[1] || '';
      city = city.replace(/_/g, ' ');
      h[city] = k;
      return h
    }, {});

    //try to match these against iana form
    const normalize = (tz) => {
      tz = tz.replace(/ time/g, '');
      tz = tz.replace(/ (standard|daylight|summer)/g, '');
      tz = tz.replace(/\b(east|west|north|south)ern/g, '$1');
      tz = tz.replace(/\b(africa|america|australia)n/g, '$1');
      tz = tz.replace(/\beuropean/g, 'europe');
      tz = tz.replace(/\islands/g, 'island');
      return tz
    };

    // try our best to reconcile the timzone to this given string
    const lookupTz = (str, zones) => {
      if (!str) {
        return local
      }
      if (typeof str !== 'string') {
        console.error("Timezone must be a string - recieved: '", str, "'\n");
      }
      let tz = str.trim();
      // let split = str.split('/')
      //support long timezones like 'America/Argentina/Rio_Gallegos'
      // if (split.length > 2 && zones.hasOwnProperty(tz) === false) {
      //   tz = split[0] + '/' + split[1]
      // }
      tz = tz.toLowerCase();
      if (zones.hasOwnProperty(tz) === true) {
        return tz
      }
      //lookup more loosely..
      tz = normalize(tz);
      if (zones.hasOwnProperty(tz) === true) {
        return tz
      }
      //try city-names
      if (cities.hasOwnProperty(tz) === true) {
        return cities[tz]
      }
      // //try to parse '-5h'
      if (/[0-9]/.test(tz) === true) {
        let id = parseOffset(tz);
        if (id) {
          return id
        }
      }

      throw new Error(
        "Spacetime: Cannot find timezone named: '" + str + "'. Please enter an IANA timezone id."
      )
    };

    //git:blame @JuliasCaesar https://www.timeanddate.com/date/leapyear.html
    function isLeapYear(year) { return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 }
    // unsurprisingly-nasty `typeof date` call
    function isDate(d) { return Object.prototype.toString.call(d) === '[object Date]' && !isNaN(d.valueOf()) }
    function isArray(input) { return Object.prototype.toString.call(input) === '[object Array]' }
    function isObject(input) { return Object.prototype.toString.call(input) === '[object Object]' }
    function isBoolean(input) { return Object.prototype.toString.call(input) === '[object Boolean]' }

    function zeroPad(str, len = 2) {
      let pad = '0';
      str = str + '';
      return str.length >= len ? str : new Array(len - str.length + 1).join(pad) + str
    }

    function titleCase(str) {
      if (!str) {
        return ''
      }
      return str[0].toUpperCase() + str.substr(1)
    }

    function ordinal(i) {
      let j = i % 10;
      let k = i % 100;
      if (j === 1 && k !== 11) {
        return i + 'st'
      }
      if (j === 2 && k !== 12) {
        return i + 'nd'
      }
      if (j === 3 && k !== 13) {
        return i + 'rd'
      }
      return i + 'th'
    }

    //strip 'st' off '1st'..
    function toCardinal(str) {
      str = String(str);
      str = str.replace(/([0-9])(st|nd|rd|th)$/i, '$1');
      return parseInt(str, 10)
    }

    //used mostly for cleanup of unit names, like 'months'
    function normalize$1(str = '') {
      str = str.toLowerCase().trim();
      str = str.replace(/ies$/, 'y'); //'centuries'
      str = str.replace(/s$/, '');
      str = str.replace(/-/g, '');
      if (str === 'day' || str === 'days') {
        return 'date'
      }
      if (str === 'min' || str === 'mins') {
        return 'minute'
      }
      return str
    }

    function getEpoch(tmp) {
      //support epoch
      if (typeof tmp === 'number') {
        return tmp
      }
      //suport date objects
      if (isDate(tmp)) {
        return tmp.getTime()
      }
      if (tmp.epoch) {
        return tmp.epoch
      }
      return null
    }

    //make sure this input is a spacetime obj
    function beADate(d, s) {
      if (isObject(d) === false) {
        return s.clone().set(d)
      }
      return d
    }

    function formatTimezone(offset, delimiter = '') {
      const sign = offset > 0 ? '+' : '-';
      const absOffset = Math.abs(offset);
      const hours = zeroPad(parseInt('' + absOffset, 10));
      const minutes = zeroPad((absOffset % 1) * 60);
      return `${sign}${hours}${delimiter}${minutes}`
    }

    const defaults = {
      year: new Date().getFullYear(),
      month: 0,
      date: 1
    };

    //support [2016, 03, 01] format
    const parseArray = (s, arr, today) => {
      if (arr.length === 0) {
        return s
      }
      let order = ['year', 'month', 'date', 'hour', 'minute', 'second', 'millisecond'];
      for (let i = 0; i < order.length; i++) {
        let num = arr[i] || today[order[i]] || defaults[order[i]] || 0;
        s = s[order[i]](num);
      }
      return s
    };

    //support {year:2016, month:3} format
    const parseObject = (s, obj, today) => {
      // if obj is empty, do nothing
      if (Object.keys(obj).length === 0) {
        return s
      }
      obj = Object.assign({}, defaults, today, obj);
      let keys = Object.keys(obj);
      for (let i = 0; i < keys.length; i++) {
        let unit = keys[i];
        //make sure we have this method
        if (s[unit] === undefined || typeof s[unit] !== 'function') {
          continue
        }
        //make sure the value is a number
        if (obj[unit] === null || obj[unit] === undefined || obj[unit] === '') {
          continue
        }
        let num = obj[unit] || today[unit] || defaults[unit] || 0;
        s = s[unit](num);
      }
      return s
    };

    // this may seem like an arbitrary number, but it's 'within jan 1970'
    // this is only really ambiguous until 2054 or so
    const parseNumber = function (s, input) {
      const minimumEpoch = 2500000000;
      // if the given epoch is really small, they've probably given seconds and not milliseconds
      // anything below this number is likely (but not necessarily) a mistaken input.
      if (input > 0 && input < minimumEpoch && s.silent === false) {
        console.warn('  - Warning: You are setting the date to January 1970.');
        console.warn('       -   did input seconds instead of milliseconds?');
      }
      s.epoch = input;
      return s
    };

    var fns = {
      parseArray,
      parseObject,
      parseNumber
    };

    // pull in 'today' data for the baseline moment
    const getNow = function (s) {
      s.epoch = Date.now();
      Object.keys(s._today || {}).forEach((k) => {
        if (typeof s[k] === 'function') {
          s = s[k](s._today[k]);
        }
      });
      return s
    };

    const dates = {
      now: (s) => {
        return getNow(s)
      },
      today: (s) => {
        return getNow(s)
      },
      tonight: (s) => {
        s = getNow(s);
        s = s.hour(18); //6pm
        return s
      },
      tomorrow: (s) => {
        s = getNow(s);
        s = s.add(1, 'day');
        s = s.startOf('day');
        return s
      },
      yesterday: (s) => {
        s = getNow(s);
        s = s.subtract(1, 'day');
        s = s.startOf('day');
        return s
      },
      christmas: (s) => {
        let year = getNow(s).year();
        s = s.set([year, 11, 25, 18, 0, 0]); // Dec 25
        return s
      },
      'new years': (s) => {
        let year = getNow(s).year();
        s = s.set([year, 11, 31, 18, 0, 0]); // Dec 31
        return s
      }
    };
    dates['new years eve'] = dates['new years'];

    //little cleanup..
    const normalize$2 = function (str) {
      // remove all day-names
      str = str.replace(/\b(mon|tues?|wed|wednes|thur?s?|fri|sat|satur|sun)(day)?\b/i, '');
      //remove ordinal ending
      str = str.replace(/([0-9])(th|rd|st|nd)/, '$1');
      str = str.replace(/,/g, '');
      str = str.replace(/ +/g, ' ').trim();
      return str
    };

    let o = {
      millisecond: 1
    };
    o.second = 1000;
    o.minute = 60000;
    o.hour = 3.6e6; // dst is supported post-hoc
    o.day = 8.64e7; //
    o.date = o.day;
    o.month = 8.64e7 * 29.5; //(average)
    o.week = 6.048e8;
    o.year = 3.154e10; // leap-years are supported post-hoc
    //add plurals
    Object.keys(o).forEach(k => {
      o[k + 's'] = o[k];
    });

    //basically, step-forward/backward until js Date object says we're there.
    const walk = (s, n, fn, unit, previous) => {
      let current = s.d[fn]();
      if (current === n) {
        return //already there
      }
      let startUnit = previous === null ? null : s.d[previous]();
      let original = s.epoch;
      //try to get it as close as we can
      let diff = n - current;
      s.epoch += o[unit] * diff;
      //DST edge-case: if we are going many days, be a little conservative
      // console.log(unit, diff)
      if (unit === 'day') {
        // s.epoch -= ms.minute
        //but don't push it over a month
        if (Math.abs(diff) > 28 && n < 28) {
          s.epoch += o.hour;
        }
      }
      // 1st time: oops, did we change previous unit? revert it.
      if (previous !== null && startUnit !== s.d[previous]()) {
        // console.warn('spacetime warning: missed setting ' + unit)
        s.epoch = original;
        // s.epoch += ms[unit] * diff * 0.89 // maybe try and make it close...?
      }
      //repair it if we've gone too far or something
      //(go by half-steps, just in case)
      const halfStep = o[unit] / 2;
      while (s.d[fn]() < n) {
        s.epoch += halfStep;
      }

      while (s.d[fn]() > n) {
        s.epoch -= halfStep;
      }
      // 2nd time: did we change previous unit? revert it.
      if (previous !== null && startUnit !== s.d[previous]()) {
        // console.warn('spacetime warning: missed setting ' + unit)
        s.epoch = original;
      }
    };
    //find the desired date by a increment/check while loop
    const units = {
      year: {
        valid: (n) => n > -4000 && n < 4000,
        walkTo: (s, n) => walk(s, n, 'getFullYear', 'year', null)
      },
      month: {
        valid: (n) => n >= 0 && n <= 11,
        walkTo: (s, n) => {
          let d = s.d;
          let current = d.getMonth();
          let original = s.epoch;
          let startUnit = d.getFullYear();
          if (current === n) {
            return
          }
          //try to get it as close as we can..
          let diff = n - current;
          s.epoch += o.day * (diff * 28); //special case
          //oops, did we change the year? revert it.
          if (startUnit !== s.d.getFullYear()) {
            s.epoch = original;
          }
          //increment by day
          while (s.d.getMonth() < n) {
            s.epoch += o.day;
          }
          while (s.d.getMonth() > n) {
            s.epoch -= o.day;
          }
        }
      },
      date: {
        valid: (n) => n > 0 && n <= 31,
        walkTo: (s, n) => walk(s, n, 'getDate', 'day', 'getMonth')
      },
      hour: {
        valid: (n) => n >= 0 && n < 24,
        walkTo: (s, n) => walk(s, n, 'getHours', 'hour', 'getDate')
      },
      minute: {
        valid: (n) => n >= 0 && n < 60,
        walkTo: (s, n) => walk(s, n, 'getMinutes', 'minute', 'getHours')
      },
      second: {
        valid: (n) => n >= 0 && n < 60,
        walkTo: (s, n) => {
          //do this one directly
          s.epoch = s.seconds(n).epoch;
        }
      },
      millisecond: {
        valid: (n) => n >= 0 && n < 1000,
        walkTo: (s, n) => {
          //do this one directly
          s.epoch = s.milliseconds(n).epoch;
        }
      }
    };

    const walkTo = (s, wants) => {
      let keys = Object.keys(units);
      let old = s.clone();
      for (let i = 0; i < keys.length; i++) {
        let k = keys[i];
        let n = wants[k];
        if (n === undefined) {
          n = old[k]();
        }
        if (typeof n === 'string') {
          n = parseInt(n, 10);
        }
        //make-sure it's valid
        if (!units[k].valid(n)) {
          s.epoch = null;
          if (s.silent === false) {
            console.warn('invalid ' + k + ': ' + n);
          }
          return
        }
        units[k].walkTo(s, n);
      }
      return
    };

    const monthLengths = [
      31, // January - 31 days
      28, // February - 28 days in a common year and 29 days in leap years
      31, // March - 31 days
      30, // April - 30 days
      31, // May - 31 days
      30, // June - 30 days
      31, // July - 31 days
      31, // August - 31 days
      30, // September - 30 days
      31, // October - 31 days
      30, // November - 30 days
      31 // December - 31 days
    ];

    // 28 - feb
    // 30 - april, june, sept, nov
    // 31 - jan, march, may, july, aug, oct, dec

    let shortMonths = [
      'jan',
      'feb',
      'mar',
      'apr',
      'may',
      'jun',
      'jul',
      'aug',
      'sep',
      'oct',
      'nov',
      'dec'
    ];
    let longMonths = [
      'january',
      'february',
      'march',
      'april',
      'may',
      'june',
      'july',
      'august',
      'september',
      'october',
      'november',
      'december'
    ];

    function buildMapping() {
      const obj = {
        sep: 8 //support this format
      };
      for (let i = 0; i < shortMonths.length; i++) {
        obj[shortMonths[i]] = i;
      }
      for (let i = 0; i < longMonths.length; i++) {
        obj[longMonths[i]] = i;
      }
      return obj
    }

    function short() { return shortMonths }
    function long() { return longMonths }
    function mapping() { return buildMapping() }
    function set(i18n) {
      shortMonths = i18n.short || shortMonths;
      longMonths = i18n.long || longMonths;
    }

    //pull-apart ISO offsets, like "+0100"
    const parseOffset$1 = (s, offset) => {
      if (!offset) {
        return s
      }

      // according to ISO8601, tz could be hh:mm, hhmm or hh
      // so need few more steps before the calculation.
      let num = 0;

      // for (+-)hh:mm
      if (/^[\+-]?[0-9]{2}:[0-9]{2}$/.test(offset)) {
        //support "+01:00"
        if (/:00/.test(offset) === true) {
          offset = offset.replace(/:00/, '');
        }
        //support "+01:30"
        if (/:30/.test(offset) === true) {
          offset = offset.replace(/:30/, '.5');
        }
      }

      // for (+-)hhmm
      if (/^[\+-]?[0-9]{4}$/.test(offset)) {
        offset = offset.replace(/30$/, '.5');
      }
      num = parseFloat(offset);

      //divide by 100 or 10 - , "+0100", "+01"
      if (Math.abs(num) > 100) {
        num = num / 100;
      }
      //this is a fancy-move
      if (num === 0 || offset === 'Z' || offset === 'z') {
        s.tz = 'etc/gmt';
        return s
      }
      //okay, try to match it to a utc timezone
      //remember - this is opposite! a -5 offset maps to Etc/GMT+5  ¯\_(:/)_/¯
      //https://askubuntu.com/questions/519550/why-is-the-8-timezone-called-gmt-8-in-the-filesystem
      num *= -1;

      if (num >= 0) {
        num = '+' + num;
      }
      let tz = 'etc/gmt' + num;
      let zones = s.timezones;

      if (zones[tz]) {
        // log a warning if we're over-writing a given timezone?
        // console.log('changing timezone to: ' + tz)
        s.tz = tz;
      }
      return s
    };

    // truncate any sub-millisecond values
    const parseMs = function (str = '') {
      str = String(str);
      //js does not support sub-millisecond values 
      // so truncate these - 2021-11-02T19:55:30.087772
      if (str.length > 3) {
        str = str.substr(0, 3);
      } else if (str.length === 1) {
        // assume ms are zero-padded on the left
        // but maybe not on the right.
        // turn '.10' into '.100'
        str = str + '00';
      } else if (str.length === 2) {
        str = str + '0';
      }
      return Number(str) || 0
    };

    const parseTime = (s, str = '') => {
      // remove all whitespace
      str = str.replace(/^\s+/, '').toLowerCase();
      //formal time format - 04:30.23
      let arr = str.match(/([0-9]{1,2}):([0-9]{1,2}):?([0-9]{1,2})?[:\.]?([0-9]{1,4})?/);
      if (arr !== null) {
        //validate it a little
        let h = Number(arr[1]);
        if (h < 0 || h > 24) {
          return s.startOf('day')
        }
        let m = Number(arr[2]); //don't accept '5:3pm'
        if (arr[2].length < 2 || m < 0 || m > 59) {
          return s.startOf('day')
        }
        s = s.hour(h);
        s = s.minute(m);
        s = s.seconds(arr[3] || 0);
        s = s.millisecond(parseMs(arr[4]));
        //parse-out am/pm
        let ampm = str.match(/[\b0-9] ?(am|pm)\b/);
        if (ampm !== null && ampm[1]) {
          s = s.ampm(ampm[1]);
        }
        return s
      }

      //try an informal form - 5pm (no minutes)
      arr = str.match(/([0-9]+) ?(am|pm)/);
      if (arr !== null && arr[1]) {
        let h = Number(arr[1]);
        //validate it a little..
        if (h > 12 || h < 1) {
          return s.startOf('day')
        }
        s = s.hour(arr[1] || 0);
        s = s.ampm(arr[2]);
        s = s.startOf('hour');
        return s
      }

      //no time info found, use start-of-day
      s = s.startOf('day');
      return s
    };

    let months = mapping();

    //given a month, return whether day number exists in it
    const validate = (obj) => {
      //invalid values
      if (monthLengths.hasOwnProperty(obj.month) !== true) {
        return false
      }
      //support leap-year in february
      if (obj.month === 1) {
        if (isLeapYear(obj.year) && obj.date <= 29) {
          return true
        } else {
          return obj.date <= 28
        }
      }
      //is this date too-big for this month?
      let max = monthLengths[obj.month] || 0;
      if (obj.date <= max) {
        return true
      }
      return false
    };

    const parseYear = (str = '', today) => {
      str = str.trim();
      // parse '86 shorthand
      if (/^'[0-9][0-9]$/.test(str) === true) {
        let num = Number(str.replace(/'/, ''));
        if (num > 50) {
          return 1900 + num
        }
        return 2000 + num
      }
      let year = parseInt(str, 10);
      // use a given year from options.today
      if (!year && today) {
        year = today.year;
      }
      // fallback to this year
      year = year || new Date().getFullYear();
      return year
    };

    const parseMonth = function (str) {
      str = str.toLowerCase().trim();
      if (str === 'sept') {
        return months.sep
      }
      return months[str]
    };

    var ymd = [
      // =====
      //  y-m-d
      // =====
      //iso-this 1998-05-30T22:00:00:000Z, iso-that 2017-04-03T08:00:00-0700
      {
        reg: /^(\-?0?0?[0-9]{3,4})-([0-9]{1,2})-([0-9]{1,2})[T| ]([0-9.:]+)(Z|[0-9\-\+:]+)?$/i,
        parse: (s, m) => {
          let obj = {
            year: m[1],
            month: parseInt(m[2], 10) - 1,
            date: m[3]
          };
          if (validate(obj) === false) {
            s.epoch = null;
            return s
          }
          parseOffset$1(s, m[5]);
          walkTo(s, obj);
          s = parseTime(s, m[4]);
          return s
        }
      },
      //short-iso "2015-03-25" or "2015/03/25" or "2015/03/25 12:26:14 PM"
      {
        reg: /^([0-9]{4})[\-\/\. ]([0-9]{1,2})[\-\/\. ]([0-9]{1,2})( [0-9]{1,2}(:[0-9]{0,2})?(:[0-9]{0,3})? ?(am|pm)?)?$/i,
        parse: (s, m) => {
          let obj = {
            year: m[1],
            month: parseInt(m[2], 10) - 1,
            date: parseInt(m[3], 10)
          };
          if (obj.month >= 12) {
            //support yyyy/dd/mm (weird, but ok)
            obj.date = parseInt(m[2], 10);
            obj.month = parseInt(m[3], 10) - 1;
          }
          if (validate(obj) === false) {
            s.epoch = null;
            return s
          }
          walkTo(s, obj);
          s = parseTime(s, m[4]);
          return s
        }
      },

      //text-month "2015-feb-25"
      {
        reg: /^([0-9]{4})[\-\/\. ]([a-z]+)[\-\/\. ]([0-9]{1,2})( [0-9]{1,2}(:[0-9]{0,2})?(:[0-9]{0,3})? ?(am|pm)?)?$/i,
        parse: (s, m) => {
          let obj = {
            year: parseYear(m[1], s._today),
            month: parseMonth(m[2]),
            date: toCardinal(m[3] || '')
          };
          if (validate(obj) === false) {
            s.epoch = null;
            return s
          }
          walkTo(s, obj);
          s = parseTime(s, m[4]);
          return s
        }
      }
    ];

    var mdy = [
      // =====
      //  m-d-y
      // =====
      //mm/dd/yyyy - uk/canada "6/28/2019, 12:26:14 PM"
      {
        reg: /^([0-9]{1,2})[\-\/.]([0-9]{1,2})[\-\/.]?([0-9]{4})?( [0-9]{1,2}:[0-9]{2}:?[0-9]{0,2}? ?(am|pm|gmt))?$/i,
        parse: (s, arr) => {
          let month = parseInt(arr[1], 10) - 1;
          let date = parseInt(arr[2], 10);
          //support dd/mm/yyy
          if (s.british || month >= 12) {
            date = parseInt(arr[1], 10);
            month = parseInt(arr[2], 10) - 1;
          }
          let obj = {
            date,
            month,
            year: parseYear(arr[3], s._today) || new Date().getFullYear()
          };
          if (validate(obj) === false) {
            s.epoch = null;
            return s
          }
          walkTo(s, obj);
          s = parseTime(s, arr[4]);
          return s
        }
      },
      //alt short format - "feb-25-2015"
      {
        reg: /^([a-z]+)[\-\/\. ]([0-9]{1,2})[\-\/\. ]?([0-9]{4}|'[0-9]{2})?( [0-9]{1,2}(:[0-9]{0,2})?(:[0-9]{0,3})? ?(am|pm)?)?$/i,
        parse: (s, arr) => {
          let obj = {
            year: parseYear(arr[3], s._today),
            month: parseMonth(arr[1]),
            date: toCardinal(arr[2] || '')
          };
          if (validate(obj) === false) {
            s.epoch = null;
            return s
          }
          walkTo(s, obj);
          s = parseTime(s, arr[4]);
          return s
        }
      },

      //Long "Mar 25 2015"
      //February 22, 2017 15:30:00
      {
        reg: /^([a-z]+) ([0-9]{1,2})( [0-9]{4})?( ([0-9:]+( ?am| ?pm| ?gmt)?))?$/i,
        parse: (s, arr) => {
          let obj = {
            year: parseYear(arr[3], s._today),
            month: parseMonth(arr[1]),
            date: toCardinal(arr[2] || '')
          };
          if (validate(obj) === false) {
            s.epoch = null;
            return s
          }
          walkTo(s, obj);
          s = parseTime(s, arr[4]);
          return s
        }
      },
      // 'Sun Mar 14 15:09:48 +0000 2021'
      {
        reg: /^([a-z]+) ([0-9]{1,2})( [0-9:]+)?( \+[0-9]{4})?( [0-9]{4})?$/i,
        parse: (s, arr) => {
          let obj = {
            year: parseYear(arr[5], s._today),
            month: parseMonth(arr[1]),
            date: toCardinal(arr[2] || '')
          };
          if (validate(obj) === false) {
            s.epoch = null;
            return s
          }
          walkTo(s, obj);
          s = parseTime(s, arr[3]);
          return s
        }
      }
    ];

    var dmy = [
      // =====
      //  d-m-y
      // =====
      //common british format - "25-feb-2015"
      {
        reg: /^([0-9]{1,2})[\-\/]([a-z]+)[\-\/]?([0-9]{4})?$/i,
        parse: (s, m) => {
          let obj = {
            year: parseYear(m[3], s._today),
            month: parseMonth(m[2]),
            date: toCardinal(m[1] || '')
          };
          if (validate(obj) === false) {
            s.epoch = null;
            return s
          }
          walkTo(s, obj);
          s = parseTime(s, m[4]);
          return s
        }
      },
      // "25 Mar 2015"
      {
        reg: /^([0-9]{1,2})( [a-z]+)( [0-9]{4}| '[0-9]{2})? ?([0-9]{1,2}:[0-9]{2}:?[0-9]{0,2}? ?(am|pm|gmt))?$/i,
        parse: (s, m) => {
          let obj = {
            year: parseYear(m[3], s._today),
            month: parseMonth(m[2]),
            date: toCardinal(m[1])
          };
          if (!obj.month || validate(obj) === false) {
            s.epoch = null;
            return s
          }
          walkTo(s, obj);
          s = parseTime(s, m[4]);
          return s
        }
      },
      // 01-jan-2020
      {
        reg: /^([0-9]{1,2})[\. -/]([a-z]+)[\. -/]([0-9]{4})?( [0-9]{1,2}(:[0-9]{0,2})?(:[0-9]{0,3})? ?(am|pm)?)?$/i,
        parse: (s, m) => {
          let obj = {
            date: Number(m[1]),
            month: parseMonth(m[2]),
            year: Number(m[3])
          };
          if (validate(obj) === false) {
            s.epoch = null;
            return s
          }
          walkTo(s, obj);
          s = s.startOf('day');
          s = parseTime(s, m[4]);
          return s
        }
      }
    ];

    var misc = [
      // =====
      // no dates
      // =====

      // '2012-06' month-only
      {
        reg: /^([0-9]{4})[\-\/]([0-9]{2})$/i,
        parse: (s, m) => {
          let obj = {
            year: m[1],
            month: parseInt(m[2], 10) - 1,
            date: 1
          };
          if (validate(obj) === false) {
            s.epoch = null;
            return s
          }
          walkTo(s, obj);
          s = parseTime(s, m[4]);
          return s
        }
      },

      //February 2017 (implied date)
      {
        reg: /^([a-z]+) ([0-9]{4})$/i,
        parse: (s, arr) => {
          let obj = {
            year: parseYear(arr[2], s._today),
            month: parseMonth(arr[1]),
            date: s._today.date || 1
          };
          if (validate(obj) === false) {
            s.epoch = null;
            return s
          }
          walkTo(s, obj);
          s = parseTime(s, arr[4]);
          return s
        }
      },

      {
        // 'q2 2002'
        reg: /^(q[0-9])( of)?( [0-9]{4})?/i,
        parse: (s, arr) => {
          let quarter = arr[1] || '';
          s = s.quarter(quarter);
          let year = arr[3] || '';
          if (year) {
            year = year.trim();
            s = s.year(year);
          }
          return s
        }
      },
      {
        // 'summer 2002'
        reg: /^(spring|summer|winter|fall|autumn)( of)?( [0-9]{4})?/i,
        parse: (s, arr) => {
          let season = arr[1] || '';
          s = s.season(season);
          let year = arr[3] || '';
          if (year) {
            year = year.trim();
            s = s.year(year);
          }
          return s
        }
      },
      {
        // '200bc'
        reg: /^[0-9,]+ ?b\.?c\.?$/i,
        parse: (s, arr) => {
          let str = arr[0] || '';
          //make year-negative
          str = str.replace(/^([0-9,]+) ?b\.?c\.?$/i, '-$1');
          let d = new Date();
          let obj = {
            year: parseInt(str.trim(), 10),
            month: d.getMonth(),
            date: d.getDate()
          };
          if (validate(obj) === false) {
            s.epoch = null;
            return s
          }
          walkTo(s, obj);
          s = parseTime(s);
          return s
        }
      },
      {
        // '200ad'
        reg: /^[0-9,]+ ?(a\.?d\.?|c\.?e\.?)$/i,
        parse: (s, arr) => {
          let str = arr[0] || '';
          //remove commas
          str = str.replace(/,/g, '');
          let d = new Date();
          let obj = {
            year: parseInt(str.trim(), 10),
            month: d.getMonth(),
            date: d.getDate()
          };
          if (validate(obj) === false) {
            s.epoch = null;
            return s
          }
          walkTo(s, obj);
          s = parseTime(s);
          return s
        }
      },
      {
        // '1992'
        reg: /^[0-9]{4}( ?a\.?d\.?)?$/i,
        parse: (s, arr) => {
          let today = s._today;
          // using today's date, but a new month is awkward.
          if (today.month && !today.date) {
            today.date = 1;
          }
          let d = new Date();
          let obj = {
            year: parseYear(arr[0], today),
            month: today.month || d.getMonth(),
            date: today.date || d.getDate()
          };
          if (validate(obj) === false) {
            s.epoch = null;
            return s
          }
          walkTo(s, obj);
          s = parseTime(s);
          return s
        }
      }
    ];

    var parsers = [].concat(ymd, mdy, dmy, misc);

    const parseString = function (s, input, givenTz) {
      // let parsers = s.parsers || []
      //try each text-parse template, use the first good result
      for (let i = 0; i < parsers.length; i++) {
        let m = input.match(parsers[i].reg);
        if (m) {
          // console.log(parsers[i].reg)
          let res = parsers[i].parse(s, m, givenTz);
          if (res !== null && res.isValid()) {
            return res
          }
        }
      }
      if (s.silent === false) {
        console.warn("Warning: couldn't parse date-string: '" + input + "'");
      }
      s.epoch = null;
      return s
    };

    const { parseArray: parseArray$1, parseObject: parseObject$1, parseNumber: parseNumber$1 } = fns;
    //we have to actually parse these inputs ourselves
    //  -  can't use built-in js parser ;(
    //=========================================
    // ISO Date	  "2015-03-25"
    // Short Date	"03/25/2015" or "2015/03/25"
    // Long Date	"Mar 25 2015" or "25 Mar 2015"
    // Full Date	"Wednesday March 25 2015"
    //=========================================

    const defaults$1 = {
      year: new Date().getFullYear(),
      month: 0,
      date: 1
    };

    //find the epoch from different input styles
    const parseInput = (s, input) => {
      let today = s._today || defaults$1;
      //if we've been given a epoch number, it's easy
      if (typeof input === 'number') {
        return parseNumber$1(s, input)
      }
      //set tmp time
      s.epoch = Date.now();
      // overwrite tmp time with 'today' value, if exists
      if (s._today && isObject(s._today) && Object.keys(s._today).length > 0) {
        let res = parseObject$1(s, today, defaults$1);
        if (res.isValid()) {
          s.epoch = res.epoch;
        }
      }
      // null input means 'now'
      if (input === null || input === undefined || input === '') {
        return s //k, we're good.
      }
      //support input of Date() object
      if (isDate(input) === true) {
        s.epoch = input.getTime();
        return s
      }
      //support [2016, 03, 01] format
      if (isArray(input) === true) {
        s = parseArray$1(s, input, today);
        return s
      }
      //support {year:2016, month:3} format
      if (isObject(input) === true) {
        //support spacetime object as input
        if (input.epoch) {
          s.epoch = input.epoch;
          s.tz = input.tz;
          return s
        }
        s = parseObject$1(s, input, today);
        return s
      }
      //input as a string..
      if (typeof input !== 'string') {
        return s
      }
      //little cleanup..
      input = normalize$2(input);
      //try some known-words, like 'now'
      if (dates.hasOwnProperty(input) === true) {
        s = dates[input](s);
        return s
      }
      //try each text-parse template, use the first good result
      return parseString(s, input)
    };

    let shortDays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    let longDays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

    function short$1() { return shortDays }
    function long$1() { return longDays }
    function set$1(i18n) {
      shortDays = i18n.short || shortDays;
      longDays = i18n.long || longDays;
    }
    const aliases = {
      mo: 1,
      tu: 2,
      we: 3,
      th: 4,
      fr: 5,
      sa: 6,
      su: 7,
      tues: 2,
      weds: 3,
      wedn: 3,
      thur: 4,
      thurs: 4
    };

    let titleCaseEnabled = true;

    function useTitleCase() {
      return titleCaseEnabled
    }

    function set$2(val) {
      titleCaseEnabled = val;
    }

    // create the timezone offset part of an iso timestamp
    // it's kind of nuts how involved this is
    // "+01:00", "+0100", or simply "+01"
    const isoOffset = s => {
      let offset = s.timezone().current.offset;
      return !offset ? 'Z' : formatTimezone(offset, ':')
    };

    const applyCaseFormat = (str) => {
      if (useTitleCase()) {
        return titleCase(str)
      }
      return str
    };

    // iso-year padding
    const padYear = (num) => {
      if (num >= 0) {
        return zeroPad(num, 4)
      } else {
        num = Math.abs(num);
        return '-' + zeroPad(num, 4)
      }
    };

    const format = {
      day: (s) => applyCaseFormat(s.dayName()),
      'day-short': (s) => applyCaseFormat(short$1()[s.day()]),
      'day-number': (s) => s.day(),
      'day-ordinal': (s) => ordinal(s.day()),
      'day-pad': (s) => zeroPad(s.day()),

      date: (s) => s.date(),
      'date-ordinal': (s) => ordinal(s.date()),
      'date-pad': (s) => zeroPad(s.date()),

      month: (s) => applyCaseFormat(s.monthName()),
      'month-short': (s) => applyCaseFormat(short()[s.month()]),
      'month-number': (s) => s.month(),
      'month-ordinal': (s) => ordinal(s.month()),
      'month-pad': (s) => zeroPad(s.month()),
      'iso-month': (s) => zeroPad(s.month() + 1), //1-based months

      year: (s) => {
        let year = s.year();
        if (year > 0) {
          return year
        }
        year = Math.abs(year);
        return year + ' BC'
      },
      'year-short': (s) => {
        let year = s.year();
        if (year > 0) {
          return `'${String(s.year()).substr(2, 4)}`
        }
        year = Math.abs(year);
        return year + ' BC'
      },
      'iso-year': (s) => {
        let year = s.year();
        let isNegative = year < 0;
        let str = zeroPad(Math.abs(year), 4); //0-padded
        if (isNegative) {
          //negative years are for some reason 6-digits ('-00008')
          str = zeroPad(str, 6);
          str = '-' + str;
        }
        return str
      },

      time: (s) => s.time(),
      'time-24': (s) => `${s.hour24()}:${zeroPad(s.minute())}`,

      hour: (s) => s.hour12(),
      'hour-pad': (s) => zeroPad(s.hour12()),
      'hour-24': (s) => s.hour24(),
      'hour-24-pad': (s) => zeroPad(s.hour24()),

      minute: (s) => s.minute(),
      'minute-pad': (s) => zeroPad(s.minute()),
      second: (s) => s.second(),
      'second-pad': (s) => zeroPad(s.second()),
      millisecond: (s) => s.millisecond(),
      'millisecond-pad': (s) => zeroPad(s.millisecond(), 3),

      ampm: (s) => s.ampm(),
      quarter: (s) => 'Q' + s.quarter(),
      season: (s) => s.season(),
      era: (s) => s.era(),
      json: (s) => s.json(),
      timezone: (s) => s.timezone().name,
      offset: (s) => isoOffset(s),

      numeric: (s) => `${s.year()}/${zeroPad(s.month() + 1)}/${zeroPad(s.date())}`, // yyyy/mm/dd
      'numeric-us': (s) => `${zeroPad(s.month() + 1)}/${zeroPad(s.date())}/${s.year()}`, // mm/dd/yyyy
      'numeric-uk': (s) => `${zeroPad(s.date())}/${zeroPad(s.month() + 1)}/${s.year()}`, //dd/mm/yyyy
      'mm/dd': (s) => `${zeroPad(s.month() + 1)}/${zeroPad(s.date())}`, //mm/dd

      // ... https://en.wikipedia.org/wiki/ISO_8601 ;(((
      iso: (s) => {
        let year = s.format('iso-year');
        let month = zeroPad(s.month() + 1); //1-based months
        let date = zeroPad(s.date());
        let hour = zeroPad(s.h24());
        let minute = zeroPad(s.minute());
        let second = zeroPad(s.second());
        let ms = zeroPad(s.millisecond(), 3);
        let offset = isoOffset(s);
        return `${year}-${month}-${date}T${hour}:${minute}:${second}.${ms}${offset}` //2018-03-09T08:50:00.000-05:00
      },
      'iso-short': (s) => {
        let month = zeroPad(s.month() + 1); //1-based months
        let date = zeroPad(s.date());
        let year = padYear(s.year());
        return `${year}-${month}-${date}` //2017-02-15
      },
      'iso-utc': (s) => {
        return new Date(s.epoch).toISOString() //2017-03-08T19:45:28.367Z
      },

      //i made these up
      nice: (s) => `${short()[s.month()]} ${ordinal(s.date())}, ${s.time()}`,
      'nice-24': (s) =>
        `${short()[s.month()]} ${ordinal(s.date())}, ${s.hour24()}:${zeroPad(
      s.minute()
    )}`,
      'nice-year': (s) => `${short()[s.month()]} ${ordinal(s.date())}, ${s.year()}`,
      'nice-day': (s) =>
        `${short$1()[s.day()]} ${applyCaseFormat(short()[s.month()])} ${ordinal(
      s.date()
    )}`,
      'nice-full': (s) =>
        `${s.dayName()} ${applyCaseFormat(s.monthName())} ${ordinal(s.date())}, ${s.time()}`,
      'nice-full-24': (s) =>
        `${s.dayName()} ${applyCaseFormat(s.monthName())} ${ordinal(
      s.date()
    )}, ${s.hour24()}:${zeroPad(s.minute())}`
    };
    //aliases
    const aliases$1 = {
      'day-name': 'day',
      'month-name': 'month',
      'iso 8601': 'iso',
      'time-h24': 'time-24',
      'time-12': 'time',
      'time-h12': 'time',
      tz: 'timezone',
      'day-num': 'day-number',
      'month-num': 'month-number',
      'month-iso': 'iso-month',
      'year-iso': 'iso-year',
      'nice-short': 'nice',
      'nice-short-24': 'nice-24',
      mdy: 'numeric-us',
      dmy: 'numeric-uk',
      ymd: 'numeric',
      'yyyy/mm/dd': 'numeric',
      'mm/dd/yyyy': 'numeric-us',
      'dd/mm/yyyy': 'numeric-us',
      'little-endian': 'numeric-uk',
      'big-endian': 'numeric',
      'day-nice': 'nice-day'
    };
    Object.keys(aliases$1).forEach((k) => (format[k] = format[aliases$1[k]]));

    const printFormat = (s, str = '') => {
      //don't print anything if it's an invalid date
      if (s.isValid() !== true) {
        return ''
      }
      //support .format('month')
      if (format.hasOwnProperty(str)) {
        let out = format[str](s) || '';
        if (str !== 'json') {
          out = String(out);
          if (str !== 'ampm') {
            out = applyCaseFormat(out);
          }
        }
        return out
      }
      //support '{hour}:{minute}' notation
      if (str.indexOf('{') !== -1) {
        let sections = /\{(.+?)\}/g;
        str = str.replace(sections, (_, fmt) => {
          fmt = fmt.toLowerCase().trim();
          if (format.hasOwnProperty(fmt)) {
            let out = String(format[fmt](s));
            if (fmt !== 'ampm') {
              return applyCaseFormat(out)
            }
            return out
          }
          return ''
        });
        return str
      }

      return s.format('iso-short')
    };

    //parse this insane unix-time-templating thing, from the 19th century
    //http://unicode.org/reports/tr35/tr35-25.html#Date_Format_Patterns

    //time-symbols we support
    const mapping$1 = {
      G: (s) => s.era(),
      GG: (s) => s.era(),
      GGG: (s) => s.era(),
      GGGG: (s) => (s.era() === 'AD' ? 'Anno Domini' : 'Before Christ'),
      //year
      y: (s) => s.year(),
      yy: (s) => {
        //last two chars
        return zeroPad(Number(String(s.year()).substr(2, 4)))
      },
      yyy: (s) => s.year(),
      yyyy: (s) => s.year(),
      yyyyy: (s) => '0' + s.year(),
      // u: (s) => {},//extended non-gregorian years

      //quarter
      Q: (s) => s.quarter(),
      QQ: (s) => s.quarter(),
      QQQ: (s) => s.quarter(),
      QQQQ: (s) => s.quarter(),

      //month
      M: (s) => s.month() + 1,
      MM: (s) => zeroPad(s.month() + 1),
      MMM: (s) => s.format('month-short'),
      MMMM: (s) => s.format('month'),

      //week
      w: (s) => s.week(),
      ww: (s) => zeroPad(s.week()),
      //week of month
      // W: (s) => s.week(),

      //date of month
      d: (s) => s.date(),
      dd: (s) => zeroPad(s.date()),
      //date of year
      D: (s) => s.dayOfYear(),
      DD: (s) => zeroPad(s.dayOfYear()),
      DDD: (s) => zeroPad(s.dayOfYear(), 3),

      // F: (s) => {},//date of week in month
      // g: (s) => {},//modified julian day

      //day
      E: (s) => s.format('day-short'),
      EE: (s) => s.format('day-short'),
      EEE: (s) => s.format('day-short'),
      EEEE: (s) => s.format('day'),
      EEEEE: (s) => s.format('day')[0],
      e: (s) => s.day(),
      ee: (s) => s.day(),
      eee: (s) => s.format('day-short'),
      eeee: (s) => s.format('day'),
      eeeee: (s) => s.format('day')[0],

      //am/pm
      a: (s) => s.ampm().toUpperCase(),
      aa: (s) => s.ampm().toUpperCase(),
      aaa: (s) => s.ampm().toUpperCase(),
      aaaa: (s) => s.ampm().toUpperCase(),

      //hour
      h: (s) => s.h12(),
      hh: (s) => zeroPad(s.h12()),
      H: (s) => s.hour(),
      HH: (s) => zeroPad(s.hour()),
      // j: (s) => {},//weird hour format

      m: (s) => s.minute(),
      mm: (s) => zeroPad(s.minute()),
      s: (s) => s.second(),
      ss: (s) => zeroPad(s.second()),

      //milliseconds
      SSS: (s) => zeroPad(s.millisecond(), 3),
      //milliseconds in the day
      A: (s) => s.epoch - s.startOf('day').epoch,
      //timezone
      z: (s) => s.timezone().name,
      zz: (s) => s.timezone().name,
      zzz: (s) => s.timezone().name,
      zzzz: (s) => s.timezone().name,
      Z: (s) => formatTimezone(s.timezone().current.offset),
      ZZ: (s) => formatTimezone(s.timezone().current.offset),
      ZZZ: (s) => formatTimezone(s.timezone().current.offset),
      ZZZZ: (s) => formatTimezone(s.timezone().current.offset, ':')
    };

    const addAlias = (char, to, n) => {
      let name = char;
      let toName = to;
      for (let i = 0; i < n; i += 1) {
        mapping$1[name] = mapping$1[toName];
        name += char;
        toName += to;
      }
    };
    addAlias('q', 'Q', 4);
    addAlias('L', 'M', 4);
    addAlias('Y', 'y', 4);
    addAlias('c', 'e', 4);
    addAlias('k', 'H', 2);
    addAlias('K', 'h', 2);
    addAlias('S', 's', 2);
    addAlias('v', 'z', 4);
    addAlias('V', 'Z', 4);

    // support unix-style escaping with ' character
    const escapeChars = function (arr) {
      for (let i = 0; i < arr.length; i += 1) {
        if (arr[i] === `'`) {
          // greedy-search for next apostrophe
          for (let o = i + 1; o < arr.length; o += 1) {
            if (arr[o]) {
              arr[i] += arr[o];
            }
            if (arr[o] === `'`) {
              arr[o] = null;
              break
            }
            arr[o] = null;
          }
        }
      }
      return arr.filter((ch) => ch)
    };

    //combine consecutive chars, like 'yyyy' as one.
    const combineRepeated = function (arr) {
      for (let i = 0; i < arr.length; i += 1) {
        let c = arr[i];
        // greedy-forward
        for (let o = i + 1; o < arr.length; o += 1) {
          if (arr[o] === c) {
            arr[i] += arr[o];
            arr[o] = null;
          } else {
            break
          }
        }
      }
      // '' means one apostrophe
      arr = arr.filter((ch) => ch);
      arr = arr.map((str) => {
        if (str === `''`) {
          str = `'`;
        }
        return str
      });
      return arr
    };

    const unixFmt = (s, str) => {
      let arr = str.split('');
      // support character escaping
      arr = escapeChars(arr);
      //combine 'yyyy' as string.
      arr = combineRepeated(arr);
      return arr.reduce((txt, c) => {
        if (mapping$1[c] !== undefined) {
          txt += mapping$1[c](s) || '';
        } else {
          // 'unescape'
          if (/^'.{1,}'$/.test(c)) {
            c = c.replace(/'/g, '');
          }
          txt += c;
        }
        return txt
      }, '')
    };

    const units$1 = ['year', 'season', 'quarter', 'month', 'week', 'day', 'quarterHour', 'hour', 'minute'];

    const doUnit = function (s, k) {
      let start = s.clone().startOf(k);
      let end = s.clone().endOf(k);
      let duration = end.epoch - start.epoch;
      let percent = (s.epoch - start.epoch) / duration;
      return parseFloat(percent.toFixed(2))
    };

    //how far it is along, from 0-1
    const progress = (s, unit) => {
      if (unit) {
        unit = normalize$1(unit);
        return doUnit(s, unit)
      }
      let obj = {};
      units$1.forEach(k => {
        obj[k] = doUnit(s, k);
      });
      return obj
    };

    //round to either current, or +1 of this unit
    const nearest = (s, unit) => {
      //how far have we gone?
      let prog = s.progress();
      unit = normalize$1(unit);
      //fix camel-case for this one
      if (unit === 'quarterhour') {
        unit = 'quarterHour';
      }
      if (prog[unit] !== undefined) {
        // go forward one?
        if (prog[unit] > 0.5) {
          s = s.add(1, unit);
        }
        // go to start
        s = s.startOf(unit);
      } else if (s.silent === false) {
        console.warn("no known unit '" + unit + "'");
      }
      return s
    };

    //increment until dates are the same
    const climb = (a, b, unit) => {
      let i = 0;
      a = a.clone();
      while (a.isBefore(b)) {
        //do proper, expensive increment to catch all-the-tricks
        a = a.add(1, unit);
        i += 1;
      }
      //oops, we went too-far..
      if (a.isAfter(b, unit)) {
        i -= 1;
      }
      return i
    };

    // do a thurough +=1 on the unit, until they match
    // for speed-reasons, only used on day, month, week.
    const diffOne = (a, b, unit) => {
      if (a.isBefore(b)) {
        return climb(a, b, unit)
      } else {
        return climb(b, a, unit) * -1 //reverse it
      }
    };

    // don't do anything too fancy here.
    // 2020 - 2019 may be 1 year, or 0 years
    // - '1 year difference' means 366 days during a leap year
    const fastYear = (a, b) => {
      let years = b.year() - a.year();
      // should we decrement it by 1?
      a = a.year(b.year());
      if (a.isAfter(b)) {
        years -= 1;
      }
      return years
    };

    // use a waterfall-method for computing a diff of any 'pre-knowable' units
    // compute years, then compute months, etc..
    // ... then ms-math for any very-small units
    const diff = function (a, b) {
      // an hour is always the same # of milliseconds
      // so these units can be 'pre-calculated'
      let msDiff = b.epoch - a.epoch;
      let obj = {
        milliseconds: msDiff,
        seconds: parseInt(msDiff / 1000, 10)
      };
      obj.minutes = parseInt(obj.seconds / 60, 10);
      obj.hours = parseInt(obj.minutes / 60, 10);

      //do the year
      let tmp = a.clone();
      obj.years = fastYear(tmp, b);
      tmp = a.add(obj.years, 'year');

      //there's always 12 months in a year...
      obj.months = obj.years * 12;
      tmp = a.add(obj.months, 'month');
      obj.months += diffOne(tmp, b, 'month');

      // there's always atleast 52 weeks in a year..
      // (month * 4) isn't as close
      obj.weeks = obj.years * 52;
      tmp = a.add(obj.weeks, 'week');
      obj.weeks += diffOne(tmp, b, 'week');

      // there's always atleast 7 days in a week
      obj.days = obj.weeks * 7;
      tmp = a.add(obj.days, 'day');
      obj.days += diffOne(tmp, b, 'day');

      return obj
    };

    const reverseDiff = function (obj) {
      Object.keys(obj).forEach((k) => {
        obj[k] *= -1;
      });
      return obj
    };

    // this method counts a total # of each unit, between a, b.
    // '1 month' means 28 days in february
    // '1 year' means 366 days in a leap year
    const main = function (a, b, unit) {
      b = beADate(b, a);
      //reverse values, if necessary
      let reversed = false;
      if (a.isAfter(b)) {
        let tmp = a;
        a = b;
        b = tmp;
        reversed = true;
      }
      //compute them all (i know!)
      let obj = diff(a, b);
      if (reversed) {
        obj = reverseDiff(obj);
      }
      //return just the requested unit
      if (unit) {
        //make sure it's plural-form
        unit = normalize$1(unit);
        if (/s$/.test(unit) !== true) {
          unit += 's';
        }
        if (unit === 'dates') {
          unit = 'days';
        }
        return obj[unit]
      }
      return obj
    };

    /*
    ISO 8601 duration format
    // https://en.wikipedia.org/wiki/ISO_8601#Durations
    "P3Y6M4DT12H30M5S"
    P the start of the duration representation.
    Y the number of years.
    M the number of months.
    W the number of weeks.
    D the number of days.
    T of the representation.
    H the number of hours.
    M the number of minutes.
    S the number of seconds.
    */

    const fmt = (n) => Math.abs(n) || 0;

    const toISO = function (diff) {
      let iso = 'P';
      iso += fmt(diff.years) + 'Y';
      iso += fmt(diff.months) + 'M';
      iso += fmt(diff.days) + 'DT';
      iso += fmt(diff.hours) + 'H';
      iso += fmt(diff.minutes) + 'M';
      iso += fmt(diff.seconds) + 'S';
      return iso
    };

    //get number of hours/minutes... between the two dates
    function getDiff(a, b) {
      const isBefore = a.isBefore(b);
      const later = isBefore ? b : a;
      let earlier = isBefore ? a : b;
      earlier = earlier.clone();
      const diff = {
        years: 0,
        months: 0,
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0
      };
      Object.keys(diff).forEach((unit) => {
        if (earlier.isSame(later, unit)) {
          return
        }
        let max = earlier.diff(later, unit);
        earlier = earlier.add(max, unit);
        diff[unit] = max;
      });
      //reverse it, if necessary
      if (isBefore) {
        Object.keys(diff).forEach((u) => {
          if (diff[u] !== 0) {
            diff[u] *= -1;
          }
        });
      }
      return diff
    }

    //our conceptual 'break-points' for each unit
    const qualifiers = {
      months: {
        almost: 10,
        over: 4
      },
      days: {
        almost: 25,
        over: 10
      },
      hours: {
        almost: 20,
        over: 8
      },
      minutes: {
        almost: 50,
        over: 20
      },
      seconds: {
        almost: 50,
        over: 20
      }
    };

    // Expects a plural unit arg
    function pluralize(value, unit) {
      if (value === 1) {
        unit = unit.slice(0, -1);
      }
      return value + ' ' + unit
    }

    const toSoft = function (diff) {
      let rounded = null;
      let qualified = null;
      let abbreviated = [];
      let englishValues = [];
      //go through each value and create its text-representation
      Object.keys(diff).forEach((unit, i, units) => {
        const value = Math.abs(diff[unit]);
        if (value === 0) {
          return
        }
        abbreviated.push(value + unit[0]);
        const englishValue = pluralize(value, unit);
        englishValues.push(englishValue);
        if (!rounded) {
          rounded = qualified = englishValue;
          if (i > 4) {
            return
          }
          //is it a 'almost' something, etc?
          const nextUnit = units[i + 1];
          const nextValue = Math.abs(diff[nextUnit]);
          if (nextValue > qualifiers[nextUnit].almost) {
            rounded = pluralize(value + 1, unit);
            qualified = 'almost ' + rounded;
          } else if (nextValue > qualifiers[nextUnit].over) {
            qualified = 'over ' + englishValue;
          }
        }
      });
      return { qualified, rounded, abbreviated, englishValues }
    };

    //by spencermountain + Shaun Grady

    //create the human-readable diff between the two dates
    const since = (start, end) => {
      end = beADate(end, start);
      const diff = getDiff(start, end);
      const isNow = Object.keys(diff).every((u) => !diff[u]);
      if (isNow === true) {
        return {
          diff,
          rounded: 'now',
          qualified: 'now',
          precise: 'now',
          abbreviated: [],
          iso: 'P0Y0M0DT0H0M0S',
          direction: 'present',
        }
      }
      let precise;
      let direction = 'future';

      let { rounded, qualified, englishValues, abbreviated } = toSoft(diff);

      //make them into a string
      precise = englishValues.splice(0, 2).join(', ');
      //handle before/after logic
      if (start.isAfter(end) === true) {
        rounded += ' ago';
        qualified += ' ago';
        precise += ' ago';
        direction = 'past';
      } else {
        rounded = 'in ' + rounded;
        qualified = 'in ' + qualified;
        precise = 'in ' + precise;
      }
      // https://en.wikipedia.org/wiki/ISO_8601#Durations
      // P[n]Y[n]M[n]DT[n]H[n]M[n]S 
      let iso = toISO(diff);
      return {
        diff,
        rounded,
        qualified,
        precise,
        abbreviated,
        iso,
        direction,
      }
    };

    //https://www.timeanddate.com/calendar/aboutseasons.html
    // Spring - from March 1 to May 31;
    // Summer - from June 1 to August 31;
    // Fall (autumn) - from September 1 to November 30; and,
    // Winter - from December 1 to February 28 (February 29 in a leap year).
    const north = [
      ['spring', 2, 1],
      ['summer', 5, 1],
      ['fall', 8, 1],
      ['autumn', 8, 1],
      ['winter', 11, 1] //dec 1
    ];
    const south = [
      ['fall', 2, 1],
      ['autumn', 2, 1],
      ['winter', 5, 1],
      ['spring', 8, 1],
      ['summer', 11, 1] //dec 1
    ];

    var seasons = { north, south };

    var quarters = [
      null,
      [0, 1], //jan 1
      [3, 1], //apr 1
      [6, 1], //july 1
      [9, 1] //oct 1
    ];

    const units$2 = {
      minute: (s) => {
        walkTo(s, {
          second: 0,
          millisecond: 0
        });
        return s
      },
      quarterhour: (s) => {
        let minute = s.minutes();
        if (minute >= 45) {
          s = s.minutes(45);
        } else if (minute >= 30) {
          s = s.minutes(30);
        } else if (minute >= 15) {
          s = s.minutes(15);
        } else {
          s = s.minutes(0);
        }
        walkTo(s, {
          second: 0,
          millisecond: 0
        });
        return s
      },
      hour: (s) => {
        walkTo(s, {
          minute: 0,
          second: 0,
          millisecond: 0
        });
        return s
      },
      day: (s) => {
        walkTo(s, {
          hour: 0,
          minute: 0,
          second: 0,
          millisecond: 0
        });
        return s
      },
      week: (s) => {
        let original = s.clone();
        s = s.day(s._weekStart); //monday
        if (s.isAfter(original)) {
          s = s.subtract(1, 'week');
        }
        walkTo(s, {
          hour: 0,
          minute: 0,
          second: 0,
          millisecond: 0
        });
        return s
      },
      month: (s) => {
        walkTo(s, {
          date: 1,
          hour: 0,
          minute: 0,
          second: 0,
          millisecond: 0
        });
        return s
      },
      quarter: (s) => {
        let q = s.quarter();
        if (quarters[q]) {
          walkTo(s, {
            month: quarters[q][0],
            date: quarters[q][1],
            hour: 0,
            minute: 0,
            second: 0,
            millisecond: 0
          });
        }
        return s
      },
      season: (s) => {
        let current = s.season();
        let hem = 'north';
        if (s.hemisphere() === 'South') {
          hem = 'south';
        }
        for (let i = 0; i < seasons[hem].length; i++) {
          if (seasons[hem][i][0] === current) {
            //winter goes between years
            let year = s.year();
            if (current === 'winter' && s.month() < 3) {
              year -= 1;
            }
            walkTo(s, {
              year,
              month: seasons[hem][i][1],
              date: seasons[hem][i][2],
              hour: 0,
              minute: 0,
              second: 0,
              millisecond: 0
            });
            return s
          }
        }
        return s
      },
      year: (s) => {
        walkTo(s, {
          month: 0,
          date: 1,
          hour: 0,
          minute: 0,
          second: 0,
          millisecond: 0
        });
        return s
      },
      decade: (s) => {
        s = s.startOf('year');
        let year = s.year();
        let decade = parseInt(year / 10, 10) * 10;
        s = s.year(decade);
        return s
      },
      century: (s) => {
        s = s.startOf('year');
        let year = s.year();
        // near 0AD goes '-1 | +1'
        let decade = parseInt(year / 100, 10) * 100;
        s = s.year(decade);
        return s
      }
    };
    units$2.date = units$2.day;

    const startOf = (a, unit) => {
      let s = a.clone();
      unit = normalize$1(unit);
      if (units$2[unit]) {
        return units$2[unit](s)
      }
      if (unit === 'summer' || unit === 'winter') {
        s = s.season(unit);
        return units$2.season(s)
      }
      return s
    };

    //piggy-backs off startOf
    const endOf = (a, unit) => {
      let s = a.clone();
      unit = normalize$1(unit);
      if (units$2[unit]) {
        // go to beginning, go to next one, step back 1ms
        s = units$2[unit](s); // startof
        s = s.add(1, unit);
        s = s.subtract(1, 'millisecond');
        return s
      }
      return s
    };

    //is it 'wednesday'?
    const isDay = function (unit) {
      if (short$1().find((s) => s === unit)) {
        return true
      }
      if (long$1().find((s) => s === unit)) {
        return true
      }
      return false
    };

    // return a list of the weeks/months/days between a -> b
    // returns spacetime objects in the timezone of the input
    const every = function (start, unit, end) {
      if (!unit || !end) {
        return []
      }
      //cleanup unit param
      unit = normalize$1(unit);
      //cleanup to param
      end = start.clone().set(end);
      //swap them, if they're backwards
      if (start.isAfter(end)) {
        let tmp = start;
        start = end;
        end = tmp;
      }

      //support 'every wednesday'
      let d = start.clone();
      if (isDay(unit)) {
        d = d.next(unit);
        unit = 'week';
      } else {
        let first = d.startOf(unit);
        if (first.isBefore(start)) {
          d = d.next(unit);
        }
      }
      //okay, actually start doing it
      let result = [];
      while (d.isBefore(end)) {
        result.push(d);
        d = d.add(1, unit);
      }
      return result
    };

    const parseDst = dst => {
      if (!dst) {
        return []
      }
      return dst.split('->')
    };

    const titleCase$1 = str => {
      str = str[0].toUpperCase() + str.substr(1);
      str = str.replace(/\/gmt/, '/GMT');
      str = str.replace(/[\/_]([a-z])/gi, s => {
        return s.toUpperCase()
      });
      return str
    };

    //get metadata about this timezone
    const timezone = s => {
      let zones = s.timezones;
      let tz = s.tz;
      if (zones.hasOwnProperty(tz) === false) {
        tz = lookupTz(s.tz, zones);
      }
      if (tz === null) {
        if (s.silent === false) {
          console.warn("Warn: could not find given or local timezone - '" + s.tz + "'");
        }
        return {
          current: {
            epochShift: 0
          }
        }
      }
      let found = zones[tz];
      let result = {
        name: titleCase$1(tz),
        hasDst: Boolean(found.dst),
        default_offset: found.offset,
        //do north-hemisphere version as default (sorry!)
        hemisphere: found.hem === 's' ? 'South' : 'North',
        current: {}
      };

      if (result.hasDst) {
        let arr = parseDst(found.dst);
        result.change = {
          start: arr[0],
          back: arr[1]
        };
      }
      //find the offsets for summer/winter times
      //(these variable names are north-centric)
      let summer = found.offset; // (july)
      let winter = summer; // (january) assume it's the same for now
      if (result.hasDst === true) {
        if (result.hemisphere === 'North') {
          winter = summer - 1;
        } else {
          //southern hemisphere
          winter = found.offset + 1;
        }
      }

      //find out which offset to use right now
      //use 'summer' time july-time
      if (result.hasDst === false) {
        result.current.offset = summer;
        result.current.isDST = false;
      } else if (inSummerTime(s.epoch, result.change.start, result.change.back, summer, winter) === true) {
        result.current.offset = summer;
        result.current.isDST = result.hemisphere === 'North'; //dst 'on' in winter in north
      } else {
        //use 'winter' january-time
        result.current.offset = winter;
        result.current.isDST = result.hemisphere === 'South'; //dst 'on' in summer in south
      }
      return result
    };

    const units$3 = [
      'century',
      'decade',
      'year',
      'month',
      'date',
      'day',
      'hour',
      'minute',
      'second',
      'millisecond'
    ];

    //the spacetime instance methods (also, the API)
    const methods = {
      set: function (input, tz) {
        let s = this.clone();
        s = parseInput(s, input);
        if (tz) {
          this.tz = lookupTz(tz);
        }
        return s
      },
      timezone: function () {
        return timezone(this)
      },
      isDST: function () {
        return timezone(this).current.isDST
      },
      hasDST: function () {
        return timezone(this).hasDst
      },
      offset: function () {
        return timezone(this).current.offset * 60
      },
      hemisphere: function () {
        return timezone(this).hemisphere
      },
      format: function (fmt) {
        return printFormat(this, fmt)
      },
      unixFmt: function (fmt) {
        return unixFmt(this, fmt)
      },
      startOf: function (unit) {
        return startOf(this, unit)
      },
      endOf: function (unit) {
        return endOf(this, unit)
      },
      leapYear: function () {
        let year = this.year();
        return isLeapYear(year)
      },
      progress: function (unit) {
        return progress(this, unit)
      },
      nearest: function (unit) {
        return nearest(this, unit)
      },
      diff: function (d, unit) {
        return main(this, d, unit)
      },
      since: function (d) {
        if (!d) {
          d = this.clone().set();
        }
        return since(this, d)
      },
      next: function (unit) {
        let s = this.add(1, unit);
        return s.startOf(unit)
      },
      //the start of the previous year/week/century
      last: function (unit) {
        let s = this.subtract(1, unit);
        return s.startOf(unit)
      },
      isValid: function () {
        //null/undefined epochs
        if (!this.epoch && this.epoch !== 0) {
          return false
        }
        return !isNaN(this.d.getTime())
      },
      //travel to this timezone
      goto: function (tz) {
        let s = this.clone();
        s.tz = lookupTz(tz, s.timezones); //science!
        return s
      },
      //get each week/month/day between a -> b
      every: function (unit, to) {
        // allow swapping these params:
        if (typeof unit === 'object' && typeof to === 'string') {
          let tmp = to;
          to = unit;
          unit = tmp;
        }
        return every(this, unit, to)
      },
      isAwake: function () {
        let hour = this.hour();
        //10pm -> 8am
        if (hour < 8 || hour > 22) {
          return false
        }
        return true
      },
      isAsleep: function () {
        return !this.isAwake()
      },
      daysInMonth: function () {
        switch (this.month()) {
          case 0:
            return 31
          case 1:
            return this.leapYear() ? 29 : 28
          case 2:
            return 31
          case 3:
            return 30
          case 4:
            return 31
          case 5:
            return 30
          case 6:
            return 31
          case 7:
            return 31
          case 8:
            return 30
          case 9:
            return 31
          case 10:
            return 30
          case 11:
            return 31
          default:
            throw new Error('Invalid Month state.')
        }
      },
      //pretty-printing
      log: function () {
        console.log('');
        console.log(printFormat(this, 'nice-short'));
        return this
      },
      logYear: function () {
        console.log('');
        console.log(printFormat(this, 'full-short'));
        return this
      },
      json: function () {
        return units$3.reduce((h, unit) => {
          h[unit] = this[unit]();
          return h
        }, {})
      },
      debug: function () {
        let tz = this.timezone();
        let date = this.format('MM') + ' ' + this.format('date-ordinal') + ' ' + this.year();
        date += '\n     - ' + this.format('time');
        console.log('\n\n', date + '\n     - ' + tz.name + ' (' + tz.current.offset + ')');
        return this
      },
      //alias of 'since' but opposite - like moment.js
      from: function (d) {
        d = this.clone().set(d);
        return d.since(this)
      },
      fromNow: function () {
        let d = this.clone().set(Date.now());
        return d.since(this)
      },
      weekStart: function (input) {
        //accept a number directly
        if (typeof input === 'number') {
          this._weekStart = input;
          return this
        }
        if (typeof input === 'string') {
          // accept 'wednesday'
          input = input.toLowerCase().trim();
          let num = short$1().indexOf(input);
          if (num === -1) {
            num = long$1().indexOf(input);
          }
          if (num === -1) {
            num = 1; //go back to default
          }
          this._weekStart = num;
        } else {
          console.warn('Spacetime Error: Cannot understand .weekStart() input:', input);
        }
        return this
      }
    };
    // aliases
    methods.inDST = methods.isDST;
    methods.round = methods.nearest;
    methods.each = methods.every;

    // javascript setX methods like setDate() can't be used because of the local bias

    const validate$1 = (n) => {
      //handle number as a string
      if (typeof n === 'string') {
        n = parseInt(n, 10);
      }
      return n
    };

    const order = ['year', 'month', 'date', 'hour', 'minute', 'second', 'millisecond'];

    //reduce hostile micro-changes when moving dates by millisecond
    const confirm = (s, tmp, unit) => {
      let n = order.indexOf(unit);
      let arr = order.slice(n, order.length);
      for (let i = 0; i < arr.length; i++) {
        let want = tmp[arr[i]]();
        s[arr[i]](want);
      }
      return s
    };

    // allow specifying setter direction
    const fwdBkwd = function (s, old, goFwd, unit) {
      if (goFwd === true && s.isBefore(old)) {
        s = s.add(1, unit);
      } else if (goFwd === false && s.isAfter(old)) {
        s = s.minus(1, unit);
      }
      return s
    };

    const milliseconds = function (s, n) {
      n = validate$1(n);
      let current = s.millisecond();
      let diff = current - n; //milliseconds to shift by
      return s.epoch - diff
    };

    const seconds = function (s, n, goFwd) {
      n = validate$1(n);
      let old = s.clone();
      let diff = s.second() - n;
      let shift = diff * o.second;
      s.epoch = s.epoch - shift;
      s = fwdBkwd(s, old, goFwd, 'minute'); // specify direction
      return s.epoch
    };

    const minutes = function (s, n, goFwd) {
      n = validate$1(n);
      let old = s.clone();
      let diff = s.minute() - n;
      let shift = diff * o.minute;
      s.epoch -= shift;
      confirm(s, old, 'second');
      s = fwdBkwd(s, old, goFwd, 'hour'); // specify direction
      return s.epoch
    };

    const hours = function (s, n, goFwd) {
      n = validate$1(n);
      if (n >= 24) {
        n = 24;
      } else if (n < 0) {
        n = 0;
      }
      let old = s.clone();
      let diff = s.hour() - n;
      let shift = diff * o.hour;
      s.epoch -= shift;
      // oops, did we change the day?
      if (s.date() !== old.date()) {
        s = old.clone();
        if (diff > 1) {
          diff -= 1;
        }
        if (diff < 1) {
          diff += 1;
        }
        shift = diff * o.hour;
        s.epoch -= shift;
      }
      walkTo(s, {
        hour: n
      });
      confirm(s, old, 'minute');
      s = fwdBkwd(s, old, goFwd, 'day'); // specify direction
      return s.epoch
    };

    const time = function (s, str, goFwd) {
      let m = str.match(/([0-9]{1,2})[:h]([0-9]{1,2})(:[0-9]{1,2})? ?(am|pm)?/);
      if (!m) {
        //fallback to support just '2am'
        m = str.match(/([0-9]{1,2}) ?(am|pm)/);
        if (!m) {
          return s.epoch
        }
        m.splice(2, 0, '0'); //add implicit 0 minutes
        m.splice(3, 0, ''); //add implicit seconds
      }
      let h24 = false;
      let hour = parseInt(m[1], 10);
      let minute = parseInt(m[2], 10);
      if (minute >= 60) {
        minute = 59;
      }
      if (hour > 12) {
        h24 = true;
      }
      //make the hour into proper 24h time
      if (h24 === false) {
        if (m[4] === 'am' && hour === 12) {
          //12am is midnight
          hour = 0;
        }
        if (m[4] === 'pm' && hour < 12) {
          //12pm is noon
          hour += 12;
        }
      }
      // handle seconds
      m[3] = m[3] || '';
      m[3] = m[3].replace(/:/, '');
      let sec = parseInt(m[3], 10) || 0;
      let old = s.clone();
      s = s.hour(hour);
      s = s.minute(minute);
      s = s.second(sec);
      s = s.millisecond(0);
      s = fwdBkwd(s, old, goFwd, 'day'); // specify direction
      return s.epoch
    };

    const date = function (s, n, goFwd) {
      n = validate$1(n);
      //avoid setting february 31st
      if (n > 28) {
        let month = s.month();
        let max = monthLengths[month];
        // support leap day in february
        if (month === 1 && n === 29 && isLeapYear(s.year())) {
          max = 29;
        }
        if (n > max) {
          n = max;
        }
      }
      //avoid setting < 0
      if (n <= 0) {
        n = 1;
      }
      let old = s.clone();
      walkTo(s, {
        date: n
      });
      s = fwdBkwd(s, old, goFwd, 'month'); // specify direction
      return s.epoch
    };

    const month = function (s, n, goFwd) {
      if (typeof n === 'string') {
        n = mapping()[n.toLowerCase()];
      }
      n = validate$1(n);
      //don't go past december
      if (n >= 12) {
        n = 11;
      }
      if (n <= 0) {
        n = 0;
      }

      let d = s.date();
      //there's no 30th of february, etc.
      if (d > monthLengths[n]) {
        //make it as close as we can..
        d = monthLengths[n];
      }
      let old = s.clone();
      walkTo(s, {
        month: n,
        d
      });
      s = fwdBkwd(s, old, goFwd, 'year'); // specify direction
      return s.epoch
    };

    const year = function (s, n) {
      // support '97
      if (typeof n === 'string' && /^'[0-9]{2}$/.test(n)) {
        n = n.replace(/'/, '').trim();
        n = Number(n);
        // '89 is 1989
        if (n > 30) {
          //change this in 10y
          n = 1900 + n;
        } else {
          // '12 is 2012
          n = 2000 + n;
        }
      }
      n = validate$1(n);
      walkTo(s, {
        year: n
      });
      return s.epoch
    };

    const week = function (s, n, goFwd) {
      let old = s.clone();
      n = validate$1(n);
      s = s.month(0);
      s = s.date(1);
      s = s.day('monday');
      //first week starts first Thurs in Jan
      // so mon dec 28th is 1st week
      // so mon dec 29th is not the week
      if (s.monthName() === 'december' && s.date() >= 28) {
        s = s.add(1, 'week');
      }
      n -= 1; //1-based
      s = s.add(n, 'weeks');
      s = fwdBkwd(s, old, goFwd, 'year'); // specify direction
      return s.epoch
    };

    const dayOfYear = function (s, n, goFwd) {
      n = validate$1(n);
      let old = s.clone();
      n -= 1; //days are 1-based
      if (n <= 0) {
        n = 0;
      } else if (n >= 365) {
        n = 364;
      }
      s = s.startOf('year');
      s = s.add(n, 'day');
      confirm(s, old, 'hour');
      s = fwdBkwd(s, old, goFwd, 'year'); // specify direction
      return s.epoch
    };

    let morning = 'am';
    let evening = 'pm';

    function am() { return morning }
    function pm() { return evening }
    function set$3(i18n) {
        morning = i18n.am || morning;
        evening = i18n.pm || evening;
    }

    const methods$1 = {
      millisecond: function (num) {
        if (num !== undefined) {
          let s = this.clone();
          s.epoch = milliseconds(s, num);
          return s
        }
        return this.d.getMilliseconds()
      },
      second: function (num, goFwd) {
        if (num !== undefined) {
          let s = this.clone();
          s.epoch = seconds(s, num, goFwd);
          return s
        }
        return this.d.getSeconds()
      },
      minute: function (num, goFwd) {
        if (num !== undefined) {
          let s = this.clone();
          s.epoch = minutes(s, num, goFwd);
          return s
        }
        return this.d.getMinutes()
      },
      hour: function (num, goFwd) {
        let d = this.d;
        if (num !== undefined) {
          let s = this.clone();
          s.epoch = hours(s, num, goFwd);
          return s
        }
        return d.getHours()
      },

      //'3:30' is 3.5
      hourFloat: function (num, goFwd) {
        if (num !== undefined) {
          let s = this.clone();
          let minute = num % 1;
          minute = minute * 60;
          let hour = parseInt(num, 10);
          s.epoch = hours(s, hour, goFwd);
          s.epoch = minutes(s, minute, goFwd);
          return s
        }
        let d = this.d;
        let hour = d.getHours();
        let minute = d.getMinutes();
        minute = minute / 60;
        return hour + minute
      },

      // hour in 12h format
      hour12: function (str, goFwd) {
        let d = this.d;
        if (str !== undefined) {
          let s = this.clone();
          str = '' + str;
          let m = str.match(/^([0-9]+)(am|pm)$/);
          if (m) {
            let hour = parseInt(m[1], 10);
            if (m[2] === 'pm') {
              hour += 12;
            }
            s.epoch = hours(s, hour, goFwd);
          }
          return s
        }
        //get the hour
        let hour12 = d.getHours();
        if (hour12 > 12) {
          hour12 = hour12 - 12;
        }
        if (hour12 === 0) {
          hour12 = 12;
        }
        return hour12
      },

      //some ambiguity here with 12/24h
      time: function (str, goFwd) {
        if (str !== undefined) {
          let s = this.clone();
          str = str.toLowerCase().trim();
          s.epoch = time(s, str, goFwd);
          return s
        }
        return `${this.h12()}:${zeroPad(this.minute())}${this.ampm()}`
      },

      // either 'am' or 'pm'
      ampm: function (input, goFwd) {
        // let which = 'am'
        let which = am();
        let hour = this.hour();
        if (hour >= 12) {
          // which = 'pm'
          which = pm();
        }
        if (typeof input !== 'string') {
          return which
        }
        //okay, we're doing a setter
        let s = this.clone();
        input = input.toLowerCase().trim();
        //ampm should never change the day
        // - so use `.hour(n)` instead of `.minus(12,'hour')`
        if (hour >= 12 && input === 'am') {
          //noon is 12pm
          hour -= 12;
          return s.hour(hour, goFwd)
        }
        if (hour < 12 && input === 'pm') {
          hour += 12;
          return s.hour(hour, goFwd)
        }
        return s
      },

      //some hard-coded times of day, like 'noon'
      dayTime: function (str, goFwd) {
        if (str !== undefined) {
          const times = {
            morning: '7:00am',
            breakfast: '7:00am',
            noon: '12:00am',
            lunch: '12:00pm',
            afternoon: '2:00pm',
            evening: '6:00pm',
            dinner: '6:00pm',
            night: '11:00pm',
            midnight: '23:59pm'
          };
          let s = this.clone();
          str = str || '';
          str = str.toLowerCase();
          if (times.hasOwnProperty(str) === true) {
            s = s.time(times[str], goFwd);
          }
          return s
        }
        let h = this.hour();
        if (h < 6) {
          return 'night'
        }
        if (h < 12) {
          //until noon
          return 'morning'
        }
        if (h < 17) {
          //until 5pm
          return 'afternoon'
        }
        if (h < 22) {
          //until 10pm
          return 'evening'
        }
        return 'night'
      },

      //parse a proper iso string
      iso: function (num) {
        if (num !== undefined) {
          return this.set(num)
        }
        return this.format('iso')
      }
    };

    const methods$2 = {
      // # day in the month
      date: function (num, goFwd) {
        if (num !== undefined) {
          let s = this.clone();
          num = parseInt(num, 10);
          if (num) {
            s.epoch = date(s, num, goFwd);
          }
          return s
        }
        return this.d.getDate()
      },

      //like 'wednesday' (hard!)
      day: function (input, goFwd) {
        if (input === undefined) {
          return this.d.getDay()
        }
        let original = this.clone();
        let want = input;
        // accept 'wednesday'
        if (typeof input === 'string') {
          input = input.toLowerCase();
          if (aliases.hasOwnProperty(input)) {
            want = aliases[input];
          } else {
            want = short$1().indexOf(input);
            if (want === -1) {
              want = long$1().indexOf(input);
            }
          }
        }
        //move approx
        let day = this.d.getDay();
        let diff = day - want;
        if (goFwd === true && diff > 0) {
          diff = diff - 7;
        }
        if (goFwd === false && diff < 0) {
          diff = diff + 7;
        }
        let s = this.subtract(diff, 'days');
        //tighten it back up
        walkTo(s, {
          hour: original.hour(),
          minute: original.minute(),
          second: original.second()
        });
        return s
      },

      //these are helpful name-wrappers
      dayName: function (input, goFwd) {
        if (input === undefined) {
          return long$1()[this.day()]
        }
        let s = this.clone();
        s = s.day(input, goFwd);
        return s
      }
    };

    const clearMinutes = (s) => {
      s = s.minute(0);
      s = s.second(0);
      s = s.millisecond(1);
      return s
    };

    const methods$3 = {
      // day 0-366
      dayOfYear: function (num, goFwd) {
        if (num !== undefined) {
          let s = this.clone();
          s.epoch = dayOfYear(s, num, goFwd);
          return s
        }
        //days since newyears - jan 1st is 1, jan 2nd is 2...
        let sum = 0;
        let month = this.d.getMonth();
        let tmp;
        //count the num days in each month
        for (let i = 1; i <= month; i++) {
          tmp = new Date();
          tmp.setDate(1);
          tmp.setFullYear(this.d.getFullYear()); //the year matters, because leap-years
          tmp.setHours(1);
          tmp.setMinutes(1);
          tmp.setMonth(i);
          tmp.setHours(-2); //the last day of the month
          sum += tmp.getDate();
        }
        return sum + this.d.getDate()
      },

      //since the start of the year
      week: function (num, goFwd) {
        // week-setter
        if (num !== undefined) {
          let s = this.clone();
          s.epoch = week(this, num, goFwd);
          s = clearMinutes(s);
          return s
        }
        //find-out which week it is
        let tmp = this.clone();
        tmp = tmp.month(0);
        tmp = tmp.date(1);
        tmp = clearMinutes(tmp);
        tmp = tmp.day('monday');
        //don't go into last-year
        if (tmp.monthName() === 'december' && tmp.date() >= 28) {
          tmp = tmp.add(1, 'week');
        }
        // is first monday the 1st?
        let toAdd = 1;
        if (tmp.date() === 1) {
          toAdd = 0;
        }
        tmp = tmp.minus(1, 'second');
        const thisOne = this.epoch;
        //if the week technically hasn't started yet
        if (tmp.epoch > thisOne) {
          return 1
        }
        //speed it up, if we can
        let i = 0;
        let skipWeeks = this.month() * 4;
        tmp.epoch += o.week * skipWeeks;
        i += skipWeeks;
        for (; i <= 52; i++) {
          if (tmp.epoch > thisOne) {
            return i + toAdd
          }
          tmp = tmp.add(1, 'week');
        }
        return 52
      },
      //either name or number
      month: function (input, goFwd) {
        if (input !== undefined) {
          let s = this.clone();
          s.epoch = month(s, input, goFwd);
          return s
        }
        return this.d.getMonth()
      },
      //'january'
      monthName: function (input, goFwd) {
        if (input !== undefined) {
          let s = this.clone();
          s = s.month(input, goFwd);
          return s
        }
        return long()[this.month()]
      },

      //q1, q2, q3, q4
      quarter: function (num, goFwd) {
        if (num !== undefined) {
          if (typeof num === 'string') {
            num = num.replace(/^q/i, '');
            num = parseInt(num, 10);
          }
          if (quarters[num]) {
            let s = this.clone();
            let month = quarters[num][0];
            s = s.month(month, goFwd);
            s = s.date(1, goFwd);
            s = s.startOf('day');
            return s
          }
        }
        let month = this.d.getMonth();
        for (let i = 1; i < quarters.length; i++) {
          if (month < quarters[i][0]) {
            return i - 1
          }
        }
        return 4
      },

      //spring, summer, winter, fall
      season: function (input, goFwd) {
        let hem = 'north';
        if (this.hemisphere() === 'South') {
          hem = 'south';
        }
        if (input !== undefined) {
          let s = this.clone();
          for (let i = 0; i < seasons[hem].length; i++) {
            if (input === seasons[hem][i][0]) {
              s = s.month(seasons[hem][i][1], goFwd);
              s = s.date(1);
              s = s.startOf('day');
            }
          }
          return s
        }
        let month = this.d.getMonth();
        for (let i = 0; i < seasons[hem].length - 1; i++) {
          if (month >= seasons[hem][i][1] && month < seasons[hem][i + 1][1]) {
            return seasons[hem][i][0]
          }
        }
        return 'winter'
      },

      //the year number
      year: function (num) {
        if (num !== undefined) {
          let s = this.clone();
          s.epoch = year(s, num);
          return s
        }
        return this.d.getFullYear()
      },

      //bc/ad years
      era: function (str) {
        if (str !== undefined) {
          let s = this.clone();
          str = str.toLowerCase();
          //TODO: there is no year-0AD i think. may have off-by-1 error here
          let year$1 = s.d.getFullYear();
          //make '1992' into 1992bc..
          if (str === 'bc' && year$1 > 0) {
            s.epoch = year(s, year$1 * -1);
          }
          //make '1992bc' into '1992'
          if (str === 'ad' && year$1 < 0) {
            s.epoch = year(s, year$1 * -1);
          }
          return s
        }
        if (this.d.getFullYear() < 0) {
          return 'BC'
        }
        return 'AD'
      },

      // 2019 -> 2010
      decade: function (input) {
        if (input !== undefined) {
          input = String(input);
          input = input.replace(/([0-9])'?s$/, '$1'); //1950's
          input = input.replace(/([0-9])(th|rd|st|nd)/, '$1'); //fix ordinals
          if (!input) {
            console.warn('Spacetime: Invalid decade input');
            return this
          }
          // assume 20th century?? for '70s'.
          if (input.length === 2 && /[0-9][0-9]/.test(input)) {
            input = '19' + input;
          }
          let year = Number(input);
          if (isNaN(year)) {
            return this
          }
          // round it down to the decade
          year = Math.floor(year / 10) * 10;
          return this.year(year) //.startOf('decade')
        }
        return this.startOf('decade').year()
      },
      // 1950 -> 19+1
      century: function (input) {
        if (input !== undefined) {
          if (typeof input === 'string') {
            input = input.replace(/([0-9])(th|rd|st|nd)/, '$1'); //fix ordinals
            input = input.replace(/([0-9]+) ?(b\.?c\.?|a\.?d\.?)/i, (a, b, c) => {
              if (c.match(/b\.?c\.?/i)) {
                b = '-' + b;
              }
              return b
            });
            input = input.replace(/c$/, ''); //20thC
          }
          let year = Number(input);
          if (isNaN(input)) {
            console.warn('Spacetime: Invalid century input');
            return this
          }
          // there is no century 0
          if (year === 0) {
            year = 1;
          }
          if (year >= 0) {
            year = (year - 1) * 100;
          } else {
            year = (year + 1) * 100;
          }
          return this.year(year)
        }
        // century getter
        let num = this.startOf('century').year();
        num = Math.floor(num / 100);
        if (num < 0) {
          return num - 1
        }
        return num + 1
      },
      // 2019 -> 2+1
      millenium: function (input) {
        if (input !== undefined) {
          if (typeof input === 'string') {
            input = input.replace(/([0-9])(th|rd|st|nd)/, '$1'); //fix ordinals
            input = Number(input);
            if (isNaN(input)) {
              console.warn('Spacetime: Invalid millenium input');
              return this
            }
          }
          if (input > 0) {
            input -= 1;
          }
          let year = input * 1000;
          // there is no year 0
          if (year === 0) {
            year = 1;
          }
          return this.year(year)
        }
        // get the current millenium
        let num = Math.floor(this.year() / 1000);
        if (num >= 0) {
          num += 1;
        }
        return num
      }
    };

    const methods$4 = Object.assign({}, methods$1, methods$2, methods$3);

    //aliases
    methods$4.milliseconds = methods$4.millisecond;
    methods$4.seconds = methods$4.second;
    methods$4.minutes = methods$4.minute;
    methods$4.hours = methods$4.hour;
    methods$4.hour24 = methods$4.hour;
    methods$4.h12 = methods$4.hour12;
    methods$4.h24 = methods$4.hour24;
    methods$4.days = methods$4.day;

    const addMethods = Space => {
      //hook the methods into prototype
      Object.keys(methods$4).forEach(k => {
        Space.prototype[k] = methods$4[k];
      });
    };

    const getMonthLength = function (month, year) {
      if (month === 1 && isLeapYear(year)) {
        return 29
      }
      return monthLengths[month]
    };

    //month is the one thing we 'model/compute'
    //- because ms-shifting can be off by enough
    const rollMonth = (want, old) => {
      //increment year
      if (want.month > 0) {
        let years = parseInt(want.month / 12, 10);
        want.year = old.year() + years;
        want.month = want.month % 12;
      } else if (want.month < 0) {
        let m = Math.abs(want.month);
        let years = parseInt(m / 12, 10);
        if (m % 12 !== 0) {
          years += 1;
        }
        want.year = old.year() - years;
        //ignore extras
        want.month = want.month % 12;
        want.month = want.month + 12;
        if (want.month === 12) {
          want.month = 0;
        }
      }
      return want
    };

    // briefly support day=-2 (this does not need to be perfect.)
    const rollDaysDown = (want, old, sum) => {
      want.year = old.year();
      want.month = old.month();
      let date = old.date();
      want.date = date - Math.abs(sum);
      while (want.date < 1) {
        want.month -= 1;
        if (want.month < 0) {
          want.month = 11;
          want.year -= 1;
        }
        let max = getMonthLength(want.month, want.year);
        want.date += max;
      }
      return want
    };

    // briefly support day=33 (this does not need to be perfect.)
    const rollDaysUp = (want, old, sum) => {
      let year = old.year();
      let month = old.month();
      let max = getMonthLength(month, year);
      while (sum > max) {
        sum -= max;
        month += 1;
        if (month >= 12) {
          month -= 12;
          year += 1;
        }
        max = getMonthLength(month, year);
      }
      want.month = month;
      want.date = sum;
      return want
    };

    const months$1 = rollMonth;
    const days = rollDaysUp;
    const daysBack = rollDaysDown;

    // this logic is a bit of a mess,
    // but briefly:
    // millisecond-math, and some post-processing covers most-things
    // we 'model' the calendar here only a little bit
    // and that usually works-out...

    const order$1 = ['millisecond', 'second', 'minute', 'hour', 'date', 'month'];
    let keep = {
      second: order$1.slice(0, 1),
      minute: order$1.slice(0, 2),
      quarterhour: order$1.slice(0, 2),
      hour: order$1.slice(0, 3),
      date: order$1.slice(0, 4),
      month: order$1.slice(0, 4),
      quarter: order$1.slice(0, 4),
      season: order$1.slice(0, 4),
      year: order$1,
      decade: order$1,
      century: order$1
    };
    keep.week = keep.hour;
    keep.season = keep.date;
    keep.quarter = keep.date;

    // Units need to be dst adjuested
    const dstAwareUnits = {
      year: true,
      quarter: true,
      season: true,
      month: true,
      week: true,
      date: true
    };

    const keepDate = {
      month: true,
      quarter: true,
      season: true,
      year: true
    };

    const addMethods$1 = (SpaceTime) => {
      SpaceTime.prototype.add = function (num, unit) {
        let s = this.clone();

        if (!unit || num === 0) {
          return s //don't bother
        }
        let old = this.clone();
        unit = normalize$1(unit);
        if (unit === 'millisecond') {
          s.epoch += num;
          return s
        }
        // support 'fortnight' alias
        if (unit === 'fortnight') {
          num *= 2;
          unit = 'week';
        }
        //move forward by the estimated milliseconds (rough)
        if (o[unit]) {
          s.epoch += o[unit] * num;
        } else if (unit === 'week' || unit === 'weekend') {
          s.epoch += o.day * (num * 7);
        } else if (unit === 'quarter' || unit === 'season') {
          s.epoch += o.month * (num * 3);
        } else if (unit === 'quarterhour') {
          s.epoch += o.minute * 15 * num;
        }
        //now ensure our milliseconds/etc are in-line
        let want = {};
        if (keep[unit]) {
          keep[unit].forEach((u) => {
            want[u] = old[u]();
          });
        }

        if (dstAwareUnits[unit]) {
          const diff = old.timezone().current.offset - s.timezone().current.offset;
          s.epoch += diff * 3600 * 1000;
        }

        //ensure month/year has ticked-over
        if (unit === 'month') {
          want.month = old.month() + num;
          //month is the one unit we 'model' directly
          want = months$1(want, old);
        }
        //support coercing a week, too
        if (unit === 'week') {
          let sum = old.date() + num * 7;
          if (sum <= 28 && sum > 1) {
            want.date = sum;
          }
        }
        if (unit === 'weekend' && s.dayName() !== 'saturday') {
          s = s.day('saturday', true); //ensure it's saturday
        }
        //support 25-hour day-changes on dst-changes
        else if (unit === 'date') {
          if (num < 0) {
            want = daysBack(want, old, num);
          } else {
            //specify a naive date number, if it's easy to do...
            let sum = old.date() + num;
            // ok, model this one too
            want = days(want, old, sum);
          }
          //manually punt it if we haven't moved at all..
          if (num !== 0 && old.isSame(s, 'day')) {
            want.date = old.date() + num;
          }
        }
        // ensure a quarter is 3 months over
        else if (unit === 'quarter') {
          want.month = old.month() + num * 3;
          want.year = old.year();
          // handle rollover
          if (want.month < 0) {
            let years = Math.floor(want.month / 12);
            let remainder = want.month + Math.abs(years) * 12;
            want.month = remainder;
            want.year += years;
          } else if (want.month >= 12) {
            let years = Math.floor(want.month / 12);
            want.month = want.month % 12;
            want.year += years;
          }
          want.date = old.date();
        }
        //ensure year has changed (leap-years)
        else if (unit === 'year') {
          let wantYear = old.year() + num;
          let haveYear = s.year();
          if (haveYear < wantYear) {
            let toAdd = Math.floor(num / 4) || 1; //approx num of leap-days
            s.epoch += Math.abs(o.day * toAdd);
          } else if (haveYear > wantYear) {
            let toAdd = Math.floor(num / 4) || 1; //approx num of leap-days
            s.epoch += o.day * toAdd;
          }
        }
        //these are easier
        else if (unit === 'decade') {
          want.year = s.year() + 10;
        } else if (unit === 'century') {
          want.year = s.year() + 100;
        }
        //keep current date, unless the month doesn't have it.
        if (keepDate[unit]) {
          let max = monthLengths[want.month];
          want.date = old.date();
          if (want.date > max) {
            want.date = max;
          }
        }
        if (Object.keys(want).length > 1) {
          walkTo(s, want);
        }
        return s
      };

      //subtract is only add *-1
      SpaceTime.prototype.subtract = function (num, unit) {
        let s = this.clone();
        return s.add(num * -1, unit)
      };
      //add aliases
      SpaceTime.prototype.minus = SpaceTime.prototype.subtract;
      SpaceTime.prototype.plus = SpaceTime.prototype.add;
    };

    //make a string, for easy comparison between dates
    const print = {
      millisecond: (s) => {
        return s.epoch
      },
      second: (s) => {
        return [s.year(), s.month(), s.date(), s.hour(), s.minute(), s.second()].join('-')
      },
      minute: (s) => {
        return [s.year(), s.month(), s.date(), s.hour(), s.minute()].join('-')
      },
      hour: (s) => {
        return [s.year(), s.month(), s.date(), s.hour()].join('-')
      },
      day: (s) => {
        return [s.year(), s.month(), s.date()].join('-')
      },
      week: (s) => {
        return [s.year(), s.week()].join('-')
      },
      month: (s) => {
        return [s.year(), s.month()].join('-')
      },
      quarter: (s) => {
        return [s.year(), s.quarter()].join('-')
      },
      year: (s) => {
        return s.year()
      }
    };
    print.date = print.day;

    const addMethods$2 = (SpaceTime) => {
      SpaceTime.prototype.isSame = function (b, unit, tzAware = true) {
        let a = this;
        if (!unit) {
          return null
        }
        // support swapped params
        if (typeof b === 'string' && typeof unit === 'object') {
          let tmp = b;
          b = unit;
          unit = tmp;
        }
        if (typeof b === 'string' || typeof b === 'number') {
          b = new SpaceTime(b, this.timezone.name);
        }
        //support 'seconds' aswell as 'second'
        unit = unit.replace(/s$/, '');

        // make them the same timezone for proper comparison
        if (tzAware === true && a.tz !== b.tz) {
          b = b.clone();
          b.tz = a.tz;
        }
        if (print[unit]) {
          return print[unit](a) === print[unit](b)
        }
        return null
      };
    };

    const addMethods$3 = SpaceTime => {
      const methods = {
        isAfter: function (d) {
          d = beADate(d, this);
          let epoch = getEpoch(d);
          if (epoch === null) {
            return null
          }
          return this.epoch > epoch
        },
        isBefore: function (d) {
          d = beADate(d, this);
          let epoch = getEpoch(d);
          if (epoch === null) {
            return null
          }
          return this.epoch < epoch
        },
        isEqual: function (d) {
          d = beADate(d, this);
          let epoch = getEpoch(d);
          if (epoch === null) {
            return null
          }
          return this.epoch === epoch
        },
        isBetween: function (start, end, isInclusive = false) {
          start = beADate(start, this);
          end = beADate(end, this);
          let startEpoch = getEpoch(start);
          if (startEpoch === null) {
            return null
          }
          let endEpoch = getEpoch(end);
          if (endEpoch === null) {
            return null
          }
          if (isInclusive) {
            return this.isBetween(start, end) || this.isEqual(start) || this.isEqual(end);
          }
          return startEpoch < this.epoch && this.epoch < endEpoch
        }
      };

      //hook them into proto
      Object.keys(methods).forEach(k => {
        SpaceTime.prototype[k] = methods[k];
      });
    };

    const addMethods$4 = SpaceTime => {
      const methods = {
        i18n: data => {
          //change the day names
          if (isObject(data.days)) {
            set$1(data.days);
          }
          //change the month names
          if (isObject(data.months)) {
            set(data.months);
          }

          // change the the display style of the month / day names
          if (isBoolean(data.useTitleCase)) {
            set$2(data.useTitleCase);
          }

          //change am and pm strings
          if (isObject(data.ampm)) {
            set$3(data.ampm);
          }
        }
      };

      //hook them into proto
      Object.keys(methods).forEach(k => {
        SpaceTime.prototype[k] = methods[k];
      });
    };

    let timezones = all;
    //fake timezone-support, for fakers (es5 class)
    const SpaceTime = function (input, tz, options = {}) {
      //the holy moment
      this.epoch = null;
      //the shift for the given timezone
      this.tz = lookupTz(tz, timezones);
      //whether to output warnings to console
      this.silent = typeof options.silent !== 'undefined' ? options.silent : true;
      // favour british interpretation of 02/02/2018, etc
      this.british = options.dmy || options.british;

      //does the week start on sunday, or monday:
      this._weekStart = 1; //default to monday
      if (options.weekStart !== undefined) {
        this._weekStart = options.weekStart;
      }
      // the reference today date object, (for testing)
      this._today = {};
      if (options.today !== undefined) {
        this._today = options.today;
      }
      // dunno if this is a good idea, or not
      // Object.defineProperty(this, 'parsers', {
      //   enumerable: false,
      //   writable: true,
      //   value: parsers
      // })
      //add getter/setters
      Object.defineProperty(this, 'd', {
        //return a js date object
        get: function () {
          let offset = quickOffset(this);
          //every computer is somewhere- get this computer's built-in offset
          let bias = new Date(this.epoch).getTimezoneOffset() || 0;
          //movement
          let shift = bias + offset * 60; //in minutes
          shift = shift * 60 * 1000; //in ms
          //remove this computer's offset
          let epoch = this.epoch + shift;
          let d = new Date(epoch);
          return d
        }
      });
      //add this data on the object, to allow adding new timezones
      Object.defineProperty(this, 'timezones', {
        get: () => timezones,
        set: (obj) => {
          timezones = obj;
          return obj
        }
      });
      //parse the various formats
      let tmp = parseInput(this, input);
      this.epoch = tmp.epoch;
    };

    //(add instance methods to prototype)
    Object.keys(methods).forEach((k) => {
      SpaceTime.prototype[k] = methods[k];
    });

    // ¯\_(ツ)_/¯
    SpaceTime.prototype.clone = function () {
      return new SpaceTime(this.epoch, this.tz, {
        silent: this.silent,
        weekStart: this._weekStart,
        today: this._today,
        parsers: this.parsers
      })
    };

    /**
     * @deprecated use toNativeDate()
     * @returns native date object at the same epoch
     */
    SpaceTime.prototype.toLocalDate = function () {
      return this.toNativeDate()
    };

    /**
     * @returns native date object at the same epoch
     */
    SpaceTime.prototype.toNativeDate = function () {
      return new Date(this.epoch)
    };

    //append more methods
    addMethods(SpaceTime);
    addMethods$1(SpaceTime);
    addMethods$2(SpaceTime);
    addMethods$3(SpaceTime);
    addMethods$4(SpaceTime);

    // const timezones = require('../data');

    const whereIts = (a, b) => {
      let start = new SpaceTime(null);
      let end = new SpaceTime(null);
      start = start.time(a);
      //if b is undefined, use as 'within one hour'
      if (b) {
        end = end.time(b);
      } else {
        end = start.add(59, 'minutes');
      }

      let startHour = start.hour();
      let endHour = end.hour();
      let tzs = Object.keys(start.timezones).filter((tz) => {
        if (tz.indexOf('/') === -1) {
          return false
        }
        let m = new SpaceTime(null, tz);
        let hour = m.hour();
        //do 'calendar-compare' not real-time-compare
        if (hour >= startHour && hour <= endHour) {
          //test minutes too, if applicable
          if (hour === startHour && m.minute() < start.minute()) {
            return false
          }
          if (hour === endHour && m.minute() > end.minute()) {
            return false
          }
          return true
        }
        return false
      });
      return tzs
    };

    var version = '7.1.2';

    const main$1 = (input, tz, options) => new SpaceTime(input, tz, options);

    // set all properties of a given 'today' object
    const setToday = function (s) {
      let today = s._today || {};
      Object.keys(today).forEach((k) => {
        s = s[k](today[k]);
      });
      return s
    };

    //some helper functions on the main method
    main$1.now = (tz, options) => {
      let s = new SpaceTime(new Date().getTime(), tz, options);
      s = setToday(s);
      return s
    };
    main$1.today = (tz, options) => {
      let s = new SpaceTime(new Date().getTime(), tz, options);
      s = setToday(s);
      return s.startOf('day')
    };
    main$1.tomorrow = (tz, options) => {
      let s = new SpaceTime(new Date().getTime(), tz, options);
      s = setToday(s);
      return s.add(1, 'day').startOf('day')
    };
    main$1.yesterday = (tz, options) => {
      let s = new SpaceTime(new Date().getTime(), tz, options);
      s = setToday(s);
      return s.subtract(1, 'day').startOf('day')
    };
    main$1.extend = function (obj = {}) {
      Object.keys(obj).forEach((k) => {
        SpaceTime.prototype[k] = obj[k];
      });
      return this
    };
    main$1.timezones = function () {
      let s = new SpaceTime();
      return s.timezones
    };
    main$1.max = function (tz, options) {
      let s = new SpaceTime(null, tz, options);
      s.epoch = 8640000000000000;
      return s
    };
    main$1.min = function (tz, options) {
      let s = new SpaceTime(null, tz, options);
      s.epoch = -8640000000000000;
      return s
    };

    //find tz by time
    main$1.whereIts = whereIts;
    main$1.version = version;

    //aliases:
    main$1.plugin = main$1.extend;

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

    var data$1 = [
      {
        offset: '0',
        times: [
          {
            start: '03/29',
            end: '10/25',
            zones: ['Scoresbysund', 'Azores'],
          },
        ],
      },
      {
        offset: 1,
        times: [
          {
            start: '04/19',
            end: '05/24',
            zones: ['Casablanca', 'El aaiun'],
          },
          {
            start: '04/02',
            end: '09/03',
            zones: ['Windhoek'],
          },
          {
            start: '03/29',
            end: '10/25',
            zones: [
              'Canary',
              'Faeroe',
              'Faroe',
              'Madeira',
              'Belfast',
              'Dublin',
              'Guernsey',
              'Isle of man',
              'Jersey',
              'Lisbon',
              'London',
            ],
          },
        ],
      },
      {
        offset: 2,
        times: [
          {
            start: '03/29',
            end: '10/25',
            zones: [
              'Ceuta',
              'Longyearbyen',
              'Jan mayen',
              'Amsterdam',
              'Andorra',
              'Belgrade',
              'Berlin',
              'Bratislava',
              'Brussels',
              'Budapest',
              'Busingen',
              'Copenhagen',
              'Gibraltar',
              'Ljubljana',
              'Luxembourg',
              'Madrid',
              'Malta',
              'Monaco',
              'Oslo',
              'Paris',
              'Podgorica',
              'Prague',
              'Rome',
              'San marino',
              'Sarajevo',
              'Skopje',
              'Stockholm',
              'Tirane',
              'Vaduz',
              'Vatican',
              'Vienna',
              'Warsaw',
              'Zagreb',
              'Zurich',
            ],
          },
          {
            start: '03/29',
            end: '10/25',
            zones: ['Troll'],
          },
        ],
      },
      {
        offset: 3,
        times: [
          {
            start: '03/27',
            end: '10/30',
            zones: ['Amman'],
          },
          {
            start: '03/29',
            end: '10/24',
            zones: ['Beirut'],
          },
          {
            start: '03/27',
            end: '10/29',
            zones: ['Damascus'],
          },
          {
            start: '03/29',
            end: '10/25',
            zones: [
              'Famagusta',
              'Nicosia',
              'Athens',
              'Bucharest',
              'Helsinki',
              'Kiev',
              'Mariehamn',
              'Nicosia',
              'Riga',
              'Sofia',
              'Tallinn',
              'Uzhgorod',
              'Vilnius',
              'Zaporozhye',
            ],
          },
          {
            start: '03/27',
            end: '10/31',
            zones: ['Gaza', 'Hebron'],
          },
          {
            start: '03/27',
            end: '10/25',
            zones: ['Jerusalem', 'Tel aviv'],
          },
          {
            start: '03/29',
            end: '10/25',
            zones: ['Chisinau', 'Tiraspol'],
          },
        ],
      },
      {
        offset: 8,
        times: [
          {
            start: '03/25',
            end: '09/29',
            zones: ['Ulan bator'],
          },
        ],
      },
      {
        offset: 10,
        times: [
          {
            start: '04/05',
            end: '10/04',
            zones: [
              'Act',
              'Canberra',
              'Currie',
              'Hobart',
              'Melbourne',
              'Nsw',
              'Sydney',
              'Tasmania',
              'Victoria',
            ],
          },
        ],
      },
      {
        offset: 12,
        times: [
          {
            start: '04/05',
            end: '09/27',
            zones: ['Mcmurdo', 'South pole', 'Auckland'],
          },
          {
            start: '01/12',
            end: '11/08',
            zones: ['Fiji'],
          },
        ],
      },
      {
        offset: 13,
        times: [
          {
            start: '04/05',
            end: '09/27',
            zones: ['Apia'],
          },
          {
            start: '01/15',
            end: '11/05',
            zones: ['Tongatapu'],
          },
        ],
      },
      {
        offset: -9,
        times: [
          {
            start: '03/08',
            end: '11/01',
            zones: ['Adak', 'Atka'],
          },
        ],
      },
      {
        offset: -8,
        times: [
          {
            start: '03/08',
            end: '11/01',
            zones: ['Anchorage', 'Juneau', 'Metlakatla', 'Nome', 'Sitka', 'Yakutat'],
          },
        ],
      },
      {
        offset: -4,
        times: [
          {
            start: '03/21',
            end: '10/04',
            zones: ['Asuncion'],
          },
          {
            start: '02/16',
            end: '11/03',
            zones: ['Campo grande', 'Cuiaba'],
          },
          {
            start: '03/08',
            end: '11/01',
            zones: [
              'Detroit',
              'Fort wayne',
              'Grand turk',
              'Indianapolis',
              'Iqaluit',
              'Louisville',
              'Montreal',
              'Nassau',
              'New york',
              'Nipigon',
              'Pangnirtung',
              'Port-au-prince',
              'Thunder bay',
              'Toronto',
              'Eastern',
            ],
          },
          {
            start: '03/08',
            end: '11/01',
            zones: ['Havana'],
          },
          {
            start: '03/12',
            end: '11/05',
            zones: ['Indiana', 'Kentucky'],
          },
          {
            start: '04/04',
            end: '09/06',
            zones: ['Santiago', 'Continental'],
          },
          {
            start: '05/13',
            end: '08/13',
            zones: ['Palmer'],
          },
        ],
      },
      {
        offset: -5,
        times: [
          {
            start: '04/05',
            end: '10/25',
            zones: ['Bahia banderas', 'Merida', 'Mexico city', 'Monterrey', 'General'],
          },
          {
            start: '03/08',
            end: '11/01',
            zones: [
              'Chicago',
              'Knox in',
              'Matamoros',
              'Menominee',
              'Rainy river',
              'Rankin inlet',
              'Resolute',
              'Winnipeg',
              'Central',
            ],
          },
          {
            start: '03/12',
            end: '11/05',
            zones: ['North dakota'],
          },
        ],
      },
      {
        offset: -6,
        times: [
          {
            start: '03/08',
            end: '11/01',
            zones: [
              'Boise',
              'Cambridge bay',
              'Denver',
              'Edmonton',
              'Inuvik',
              'Ojinaga',
              'Shiprock',
              'Yellowknife',
              'Mountain',
            ],
          },
          {
            start: '04/05',
            end: '10/25',
            zones: ['Chihuahua', 'Mazatlan', 'Bajasur'],
          },
          {
            start: '04/04',
            end: '09/05',
            zones: ['Easterisland', 'Easter'],
          },
        ],
      },
      {
        offset: -7,
        times: [
          {
            start: '03/08',
            end: '11/01',
            zones: [
              'Dawson',
              'Ensenada',
              'Los angeles',
              'Santa isabel',
              'Tijuana',
              'Vancouver',
              'Whitehorse',
              'Pacific',
              'Yukon',
              'Bajanorte',
            ],
          },
        ],
      },
      {
        offset: -3,
        times: [
          {
            start: '03/08',
            end: '11/01',
            zones: ['Glace bay', 'Goose bay', 'Halifax', 'Moncton', 'Thule', 'Bermuda', 'Atlantic'],
          },
        ],
      },
      {
        offset: -2,
        times: [
          {
            start: '03/28',
            end: '10/24',
            zones: ['Godthab'],
          },
          {
            start: '03/08',
            end: '11/01',
            zones: ['Miquelon'],
          },
        ],
      },
      {
        offset: -2.5,
        times: [
          {
            start: '03/08',
            end: '11/01',
            zones: ['St johns', 'Newfoundland'],
          },
        ],
      },
      {
        offset: 4.5,
        times: [
          {
            start: '03/21',
            end: '09/20',
            zones: ['Tehran'],
          },
        ],
      },
      {
        offset: 9.5,
        times: [
          {
            start: '04/05',
            end: '10/04',
            zones: ['Adelaide', 'Broken hill', 'South', 'Yancowinna'],
          },
        ],
      },
      {
        offset: 10.5,
        times: [
          {
            start: '04/05',
            end: '10/04',
            zones: ['Lhi', 'Lord howe'],
          },
        ],
      },
      {
        offset: 12.75,
        times: [
          {
            start: '04/05',
            end: '04/05',
            zones: ['Chatham'],
          },
        ],
      },
      {
        offset: 11.5,
        times: [
          {
            start: '04/05',
            end: '10/04',
            zones: ['Norfolk'],
          },
        ],
      },
    ];

    function noop$1() { }
    function assign$1(tar, src) {
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
    function create_slot$1(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context$1(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context$1(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign$1($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes$1(definition, $$scope, dirty, fn) {
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
    function update_slot$1(slot, slot_definition, ctx, $$scope, dirty, get_slot_changes_fn, get_slot_context_fn) {
        const slot_changes = get_slot_changes$1(slot_definition, $$scope, dirty, get_slot_changes_fn);
        if (slot_changes) {
            const slot_context = get_slot_context$1(slot_definition, ctx, $$scope, get_slot_context_fn);
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
    function svg_element$1(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text$1(data) {
        return document.createTextNode(data);
    }
    function space$1() {
        return text$1(' ');
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
    function set_style$1(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    function toggle_class$1(element, name, toggle) {
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
    function afterUpdate(fn) {
        get_current_component().$$.after_update.push(fn);
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

    /* spencermountain/spacetime 6.6.3 Apache 2.0 */
    function createCommonjsModule$1(fn, module) {
    	return module = { exports: {} }, fn(module, module.exports), module.exports;
    }

    function getCjsExportFromNamespace (n) {
    	return n && n['default'] || n;
    }

    var fns$1 = createCommonjsModule$1(function (module, exports) {
      //git:blame @JuliasCaesar https://www.timeanddate.com/date/leapyear.html
      exports.isLeapYear = function (year) {
        return year % 4 === 0 && year % 100 !== 0 || year % 400 === 0;
      }; // unsurprisingly-nasty `typeof date` call


      exports.isDate = function (d) {
        return Object.prototype.toString.call(d) === '[object Date]' && !isNaN(d.valueOf());
      };

      exports.isArray = function (input) {
        return Object.prototype.toString.call(input) === '[object Array]';
      };

      exports.isObject = function (input) {
        return Object.prototype.toString.call(input) === '[object Object]';
      };

      exports.zeroPad = function (str) {
        var len = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 2;
        var pad = '0';
        str = str + '';
        return str.length >= len ? str : new Array(len - str.length + 1).join(pad) + str;
      };

      exports.titleCase = function (str) {
        if (!str) {
          return '';
        }

        return str[0].toUpperCase() + str.substr(1);
      };

      exports.ordinal = function (i) {
        var j = i % 10;
        var k = i % 100;

        if (j === 1 && k !== 11) {
          return i + 'st';
        }

        if (j === 2 && k !== 12) {
          return i + 'nd';
        }

        if (j === 3 && k !== 13) {
          return i + 'rd';
        }

        return i + 'th';
      }; //strip 'st' off '1st'..


      exports.toCardinal = function (str) {
        str = String(str);
        str = str.replace(/([0-9])(st|nd|rd|th)$/i, '$1');
        return parseInt(str, 10);
      }; //used mostly for cleanup of unit names, like 'months'


      exports.normalize = function () {
        var str = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '';
        str = str.toLowerCase().trim();
        str = str.replace(/ies$/, 'y'); //'centuries'

        str = str.replace(/s$/, '');
        str = str.replace(/-/g, '');

        if (str === 'day') {
          return 'date';
        }

        return str;
      };

      exports.getEpoch = function (tmp) {
        //support epoch
        if (typeof tmp === 'number') {
          return tmp;
        } //suport date objects


        if (exports.isDate(tmp)) {
          return tmp.getTime();
        }

        if (tmp.epoch) {
          return tmp.epoch;
        }

        return null;
      }; //make sure this input is a spacetime obj


      exports.beADate = function (d, s) {
        if (exports.isObject(d) === false) {
          return s.clone().set(d);
        }

        return d;
      };

      exports.formatTimezone = function (offset) {
        var delimiter = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';
        var absOffset = Math.abs(offset);
        var sign = offset > 0 ? '+' : '-';
        return "".concat(sign).concat(exports.zeroPad(absOffset)).concat(delimiter, "00");
      };
    });
    var fns_1 = fns$1.isLeapYear;
    var fns_2 = fns$1.isDate;
    var fns_3 = fns$1.isArray;
    var fns_4 = fns$1.isObject;
    var fns_5 = fns$1.zeroPad;
    var fns_6 = fns$1.titleCase;
    var fns_7 = fns$1.ordinal;
    var fns_8 = fns$1.toCardinal;
    var fns_9 = fns$1.normalize;
    var fns_10 = fns$1.getEpoch;
    var fns_11 = fns$1.beADate;
    var fns_12 = fns$1.formatTimezone;

    var zeroPad$1 = fns$1.zeroPad;

    var serialize = function serialize(d) {
      return zeroPad$1(d.getMonth() + 1) + '/' + zeroPad$1(d.getDate()) + ':' + zeroPad$1(d.getHours());
    }; // a timezone will begin with a specific offset in january
    // then some will switch to something else between november-march


    var shouldChange = function shouldChange(epoch, start, end, defaultOffset) {
      //note: this has a cray order-of-operations issue
      //we can't get the date, without knowing the timezone, and vice-versa
      //it's possible that we can miss a dst-change by a few hours.
      var d = new Date(epoch); //(try to mediate this a little?)

      var bias = d.getTimezoneOffset() || 0;
      var shift = bias + defaultOffset * 60; //in minutes

      shift = shift * 60 * 1000; //in ms

      d = new Date(epoch + shift);
      var current = serialize(d); //eg. is it after ~november?

      if (current >= start) {
        //eg. is it before ~march~ too?
        if (current < end) {
          return true;
        }
      }

      return false;
    };

    var summerTime = shouldChange;

    // it reproduces some things in ./index.js, but speeds up spacetime considerably

    var quickOffset$1 = function quickOffset(s) {
      var zones = s.timezones;
      var obj = zones[s.tz];

      if (obj === undefined) {
        console.warn("Warning: couldn't find timezone " + s.tz);
        return 0;
      }

      if (obj.dst === undefined) {
        return obj.offset;
      } //get our two possible offsets


      var jul = obj.offset;
      var dec = obj.offset + 1; // assume it's the same for now

      if (obj.hem === 'n') {
        dec = jul - 1;
      }

      var split = obj.dst.split('->');
      var inSummer = summerTime(s.epoch, split[0], split[1], jul);

      if (inSummer === true) {
        return jul;
      }

      return dec;
    };

    var quick = quickOffset$1;

    var _build = {
    	"9|s": "2/dili,2/jayapura",
    	"9|n": "2/chita,2/khandyga,2/pyongyang,2/seoul,2/tokyo,11/palau",
    	"9.5|s|04/05:03->10/04:02": "4/adelaide,4/broken_hill,4/south,4/yancowinna",
    	"9.5|s": "4/darwin,4/north",
    	"8|s": "12/casey,2/kuala_lumpur,2/makassar,2/singapore,4/perth,4/west",
    	"8|n|03/25:03->09/29:23": "2/ulan_bator",
    	"8|n": "2/brunei,2/choibalsan,2/chongqing,2/chungking,2/harbin,2/hong_kong,2/irkutsk,2/kuching,2/macao,2/macau,2/manila,2/shanghai,2/taipei,2/ujung_pandang,2/ulaanbaatar",
    	"8.75|s": "4/eucla",
    	"7|s": "12/davis,2/jakarta,9/christmas",
    	"7|n": "2/bangkok,2/barnaul,2/ho_chi_minh,2/hovd,2/krasnoyarsk,2/novokuznetsk,2/novosibirsk,2/phnom_penh,2/pontianak,2/saigon,2/tomsk,2/vientiane",
    	"6|s": "12/vostok",
    	"6|n": "2/almaty,2/bishkek,2/dacca,2/dhaka,2/kashgar,2/omsk,2/qyzylorda,2/thimbu,2/thimphu,2/urumqi,9/chagos",
    	"6.5|n": "2/rangoon,2/yangon,9/cocos",
    	"5|s": "12/mawson,9/kerguelen",
    	"5|n": "2/aqtau,2/aqtobe,2/ashgabat,2/ashkhabad,2/atyrau,2/baku,2/dushanbe,2/karachi,2/oral,2/samarkand,2/tashkent,2/yekaterinburg,9/maldives",
    	"5.75|n": "2/kathmandu,2/katmandu",
    	"5.5|n": "2/calcutta,2/colombo,2/kolkata",
    	"4|s": "9/reunion",
    	"4|n": "2/dubai,2/muscat,2/tbilisi,2/yerevan,8/astrakhan,8/samara,8/saratov,8/ulyanovsk,8/volgograd,2/volgograd,9/mahe,9/mauritius",
    	"4.5|n|03/21:00->09/20:24": "2/tehran",
    	"4.5|n": "2/kabul",
    	"3|s": "12/syowa,9/antananarivo",
    	"3|n|03/29:03->10/25:04": "2/famagusta,2/nicosia,8/athens,8/bucharest,8/helsinki,8/kiev,8/mariehamn,8/nicosia,8/riga,8/sofia,8/tallinn,8/uzhgorod,8/vilnius,8/zaporozhye",
    	"3|n|03/29:02->10/25:03": "8/chisinau,8/tiraspol",
    	"3|n|03/29:00->10/24:24": "2/beirut",
    	"3|n|03/27:02->10/25:02": "2/jerusalem,2/tel_aviv",
    	"3|n|03/27:00->10/31:01": "2/gaza,2/hebron",
    	"3|n|03/27:00->10/30:01": "2/amman",
    	"3|n|03/27:00->10/29:24": "2/damascus",
    	"3|n": "0/addis_ababa,0/asmara,0/asmera,0/dar_es_salaam,0/djibouti,0/juba,0/kampala,0/mogadishu,0/nairobi,2/aden,2/baghdad,2/bahrain,2/istanbul,2/kuwait,2/qatar,2/riyadh,8/istanbul,8/kirov,8/minsk,8/moscow,8/simferopol,9/comoro,9/mayotte",
    	"2|s|03/29:02->10/25:02": "12/troll",
    	"2|s": "0/gaborone,0/harare,0/johannesburg,0/lubumbashi,0/lusaka,0/maputo,0/maseru,0/mbabane",
    	"2|n|03/29:02->10/25:03": "0/ceuta,arctic/longyearbyen,3/jan_mayen,8/amsterdam,8/andorra,8/belgrade,8/berlin,8/bratislava,8/brussels,8/budapest,8/busingen,8/copenhagen,8/gibraltar,8/ljubljana,8/luxembourg,8/madrid,8/malta,8/monaco,8/oslo,8/paris,8/podgorica,8/prague,8/rome,8/san_marino,8/sarajevo,8/skopje,8/stockholm,8/tirane,8/vaduz,8/vatican,8/vienna,8/warsaw,8/zagreb,8/zurich",
    	"2|n": "0/blantyre,0/bujumbura,0/cairo,0/khartoum,0/kigali,0/tripoli,8/kaliningrad",
    	"1|s|04/02:01->09/03:03": "0/windhoek",
    	"1|s": "0/kinshasa,0/luanda",
    	"1|n|04/19:03->05/31:02": "0/casablanca,0/el_aaiun",
    	"1|n|03/29:01->10/25:02": "3/canary,3/faeroe,3/faroe,3/madeira,8/belfast,8/dublin,8/guernsey,8/isle_of_man,8/jersey,8/lisbon,8/london",
    	"1|n": "0/algiers,0/bangui,0/brazzaville,0/douala,0/lagos,0/libreville,0/malabo,0/ndjamena,0/niamey,0/porto-novo,0/tunis",
    	"14|n": "11/kiritimati",
    	"13|s|04/05:04->09/27:03": "11/apia",
    	"13|s|01/15:02->11/05:03": "11/tongatapu",
    	"13|n": "11/enderbury,11/fakaofo",
    	"12|s|04/05:03->09/27:02": "12/mcmurdo,12/south_pole,11/auckland",
    	"12|s|01/12:03->11/08:02": "11/fiji",
    	"12|n": "2/anadyr,2/kamchatka,2/srednekolymsk,11/funafuti,11/kwajalein,11/majuro,11/nauru,11/tarawa,11/wake,11/wallis",
    	"12.75|s|04/05:03->04/05:02": "11/chatham",
    	"11|s": "12/macquarie,11/bougainville",
    	"11|n": "2/magadan,2/sakhalin,11/efate,11/guadalcanal,11/kosrae,11/noumea,11/pohnpei,11/ponape",
    	"11.5|n|04/05:03->10/04:02": "11/norfolk",
    	"10|s|04/05:03->10/04:02": "4/act,4/canberra,4/currie,4/hobart,4/melbourne,4/nsw,4/sydney,4/tasmania,4/victoria",
    	"10|s": "12/dumontdurville,4/brisbane,4/lindeman,4/queensland",
    	"10|n": "2/ust-nera,2/vladivostok,2/yakutsk,11/chuuk,11/guam,11/port_moresby,11/saipan,11/truk,11/yap",
    	"10.5|s|04/05:01->10/04:02": "4/lhi,4/lord_howe",
    	"0|n|03/29:00->10/25:01": "1/scoresbysund,3/azores",
    	"0|n": "0/abidjan,0/accra,0/bamako,0/banjul,0/bissau,0/conakry,0/dakar,0/freetown,0/lome,0/monrovia,0/nouakchott,0/ouagadougou,0/sao_tome,0/timbuktu,1/danmarkshavn,3/reykjavik,3/st_helena,13/gmt,13/gmt+0,13/gmt-0,13/gmt0,13/greenwich,13/utc,13/universal,13/zulu",
    	"-9|n|03/08:02->11/01:02": "1/adak,1/atka",
    	"-9|n": "11/gambier",
    	"-9.5|n": "11/marquesas",
    	"-8|n|03/08:02->11/01:02": "1/anchorage,1/juneau,1/metlakatla,1/nome,1/sitka,1/yakutat",
    	"-8|n": "11/pitcairn",
    	"-7|n|03/08:02->11/01:02": "1/dawson,1/ensenada,1/los_angeles,1/santa_isabel,1/tijuana,1/vancouver,1/whitehorse,6/pacific,6/yukon,10/bajanorte",
    	"-7|n": "1/creston,1/dawson_creek,1/hermosillo,1/phoenix",
    	"-6|s|04/04:22->09/05:22": "7/easterisland,11/easter",
    	"-6|n|04/05:02->10/25:02": "1/chihuahua,1/mazatlan,10/bajasur",
    	"-6|n|03/08:02->11/01:02": "1/boise,1/cambridge_bay,1/denver,1/edmonton,1/inuvik,1/ojinaga,1/shiprock,1/yellowknife,6/mountain",
    	"-6|n": "1/belize,1/costa_rica,1/el_salvador,1/guatemala,1/managua,1/regina,1/swift_current,1/tegucigalpa,6/east-saskatchewan,6/saskatchewan,11/galapagos",
    	"-5|s": "1/lima,1/rio_branco,5/acre",
    	"-5|n|04/05:02->10/25:02": "1/bahia_banderas,1/merida,1/mexico_city,1/monterrey,10/general",
    	"-5|n|03/12:03->11/05:01": "1/north_dakota",
    	"-5|n|03/08:02->11/01:02": "1/chicago,1/knox_in,1/matamoros,1/menominee,1/rainy_river,1/rankin_inlet,1/resolute,1/winnipeg,6/central",
    	"-5|n": "1/atikokan,1/bogota,1/cancun,1/cayman,1/coral_harbour,1/eirunepe,1/guayaquil,1/jamaica,1/panama,1/porto_acre",
    	"-4|s|05/13:23->08/13:01": "12/palmer",
    	"-4|s|04/04:24->09/06:00": "1/santiago,7/continental",
    	"-4|s|03/21:24->10/04:00": "1/asuncion",
    	"-4|s|02/16:24->11/03:00": "1/campo_grande,1/cuiaba",
    	"-4|s": "1/la_paz,1/manaus,5/west",
    	"-4|n|03/12:03->11/05:01": "1/indiana,1/kentucky",
    	"-4|n|03/08:02->11/01:02": "1/detroit,1/fort_wayne,1/grand_turk,1/indianapolis,1/iqaluit,1/louisville,1/montreal,1/nassau,1/new_york,1/nipigon,1/pangnirtung,1/port-au-prince,1/thunder_bay,1/toronto,6/eastern",
    	"-4|n|03/08:00->11/01:01": "1/havana",
    	"-4|n": "1/anguilla,1/antigua,1/aruba,1/barbados,1/blanc-sablon,1/boa_vista,1/caracas,1/curacao,1/dominica,1/grenada,1/guadeloupe,1/guyana,1/kralendijk,1/lower_princes,1/marigot,1/martinique,1/montserrat,1/port_of_spain,1/porto_velho,1/puerto_rico,1/santo_domingo,1/st_barthelemy,1/st_kitts,1/st_lucia,1/st_thomas,1/st_vincent,1/tortola,1/virgin",
    	"-3|s": "1/argentina,1/buenos_aires,1/cordoba,1/fortaleza,1/montevideo,1/punta_arenas,1/sao_paulo,12/rothera,3/stanley,5/east",
    	"-3|n|03/08:02->11/01:02": "1/glace_bay,1/goose_bay,1/halifax,1/moncton,1/thule,3/bermuda,6/atlantic",
    	"-3|n": "1/araguaina,1/bahia,1/belem,1/catamarca,1/cayenne,1/jujuy,1/maceio,1/mendoza,1/paramaribo,1/recife,1/rosario,1/santarem",
    	"-2|s": "5/denoronha",
    	"-2|n|03/28:22->10/24:23": "1/godthab",
    	"-2|n|03/08:02->11/01:02": "1/miquelon",
    	"-2|n": "1/noronha,3/south_georgia",
    	"-2.5|n|03/08:02->11/01:02": "1/st_johns,6/newfoundland",
    	"-1|n": "3/cape_verde",
    	"-11|n": "11/midway,11/niue,11/pago_pago,11/samoa",
    	"-10|n": "11/honolulu,11/johnston,11/rarotonga,11/tahiti"
    };

    var _build$1 = /*#__PURE__*/Object.freeze({
    	__proto__: null,
    	'default': _build
    });

    //prefixes for iana names..
    var _prefixes = ['africa', 'america', 'asia', 'atlantic', 'australia', 'brazil', 'canada', 'chile', 'europe', 'indian', 'mexico', 'pacific', 'antarctica', 'etc'];

    var data$2 = getCjsExportFromNamespace(_build$1);

    var all$1 = {};
    Object.keys(data$2).forEach(function (k) {
      var split = k.split('|');
      var obj = {
        offset: Number(split[0]),
        hem: split[1]
      };

      if (split[2]) {
        obj.dst = split[2];
      }

      var names = data$2[k].split(',');
      names.forEach(function (str) {
        str = str.replace(/(^[0-9]+)\//, function (before, num) {
          num = Number(num);
          return _prefixes[num] + '/';
        });
        all$1[str] = obj;
      });
    });
    all$1['utc'] = {
      offset: 0,
      hem: 'n' //(sorry)

    }; //add etc/gmt+n

    for (var i = -14; i <= 14; i += 0.5) {
      var num = i;

      if (num > 0) {
        num = '+' + num;
      }

      var name = 'etc/gmt' + num;
      all$1[name] = {
        offset: i * -1,
        //they're negative!
        hem: 'n' //(sorry)

      };
      name = 'utc/gmt' + num; //this one too, why not.

      all$1[name] = {
        offset: i * -1,
        hem: 'n'
      };
    } // console.log(all)
    // console.log(Object.keys(all).length)


    var unpack = all$1;

    //find the implicit iana code for this machine.
    //safely query the Intl object
    //based on - https://bitbucket.org/pellepim/jstimezonedetect/src
    var fallbackTZ$1 = 'utc'; //
    //this Intl object is not supported often, yet

    var safeIntl$1 = function safeIntl() {
      if (typeof Intl === 'undefined' || typeof Intl.DateTimeFormat === 'undefined') {
        return null;
      }

      var format = Intl.DateTimeFormat();

      if (typeof format === 'undefined' || typeof format.resolvedOptions === 'undefined') {
        return null;
      }

      var timezone = format.resolvedOptions().timeZone;

      if (!timezone) {
        return null;
      }

      return timezone.toLowerCase();
    };

    var guessTz$1 = function guessTz() {
      var timezone = safeIntl$1();

      if (timezone === null) {
        return fallbackTZ$1;
      }

      return timezone;
    }; //do it once per computer


    var guessTz_1 = guessTz$1;

    var isOffset$1 = /(\-?[0-9]+)h(rs)?/i;
    var isNumber$1 = /(\-?[0-9]+)/;
    var utcOffset$1 = /utc([\-+]?[0-9]+)/i;
    var gmtOffset$1 = /gmt([\-+]?[0-9]+)/i;

    var toIana$1 = function toIana(num) {
      num = Number(num);

      if (num > -13 && num < 13) {
        num = num * -1; //it's opposite!

        num = (num > 0 ? '+' : '') + num; //add plus sign

        return 'etc/gmt' + num;
      }

      return null;
    };

    var parseOffset$2 = function parseOffset(tz) {
      // '+5hrs'
      var m = tz.match(isOffset$1);

      if (m !== null) {
        return toIana$1(m[1]);
      } // 'utc+5'


      m = tz.match(utcOffset$1);

      if (m !== null) {
        return toIana$1(m[1]);
      } // 'GMT-5' (not opposite)


      m = tz.match(gmtOffset$1);

      if (m !== null) {
        var num = Number(m[1]) * -1;
        return toIana$1(num);
      } // '+5'


      m = tz.match(isNumber$1);

      if (m !== null) {
        return toIana$1(m[1]);
      }

      return null;
    };

    var parseOffset_1 = parseOffset$2;

    var local$1 = guessTz_1(); //add all the city names by themselves

    var cities$1 = Object.keys(unpack).reduce(function (h, k) {
      var city = k.split('/')[1] || '';
      city = city.replace(/_/g, ' ');
      h[city] = k;
      return h;
    }, {}); //try to match these against iana form

    var normalize$3 = function normalize(tz) {
      tz = tz.replace(/ time/g, '');
      tz = tz.replace(/ (standard|daylight|summer)/g, '');
      tz = tz.replace(/\b(east|west|north|south)ern/g, '$1');
      tz = tz.replace(/\b(africa|america|australia)n/g, '$1');
      tz = tz.replace(/\beuropean/g, 'europe');
      tz = tz.replace(/\islands/g, 'island');
      return tz;
    }; // try our best to reconcile the timzone to this given string


    var lookupTz$1 = function lookupTz(str, zones) {
      if (!str) {
        return local$1;
      }

      var tz = str.trim();
      var split = str.split('/'); //support long timezones like 'America/Argentina/Rio_Gallegos'

      if (split.length > 2 && zones.hasOwnProperty(tz) === false) {
        tz = split[0] + '/' + split[1];
      }

      tz = tz.toLowerCase();

      if (zones.hasOwnProperty(tz) === true) {
        return tz;
      } //lookup more loosely..


      tz = normalize$3(tz);

      if (zones.hasOwnProperty(tz) === true) {
        return tz;
      } //try city-names


      if (cities$1.hasOwnProperty(tz) === true) {
        return cities$1[tz];
      } // //try to parse '-5h'


      if (/[0-9]/.test(tz) === true) {
        var id = parseOffset_1(tz);

        if (id) {
          return id;
        }
      }

      throw new Error("Spacetime: Cannot find timezone named: '" + str + "'. Please enter an IANA timezone id.");
    };

    var find = lookupTz$1;

    var o$1 = {
      millisecond: 1
    };
    o$1.second = 1000;
    o$1.minute = 60000;
    o$1.hour = 3.6e6; // dst is supported post-hoc

    o$1.day = 8.64e7; //

    o$1.date = o$1.day;
    o$1.month = 8.64e7 * 29.5; //(average)

    o$1.week = 6.048e8;
    o$1.year = 3.154e10; // leap-years are supported post-hoc
    //add plurals

    Object.keys(o$1).forEach(function (k) {
      o$1[k + 's'] = o$1[k];
    });
    var milliseconds$1 = o$1;

    var walk$1 = function walk(s, n, fn, unit, previous) {
      var current = s.d[fn]();

      if (current === n) {
        return; //already there
      }

      var startUnit = previous === null ? null : s.d[previous]();
      var original = s.epoch; //try to get it as close as we can

      var diff = n - current;
      s.epoch += milliseconds$1[unit] * diff; //DST edge-case: if we are going many days, be a little conservative
      // console.log(unit, diff)

      if (unit === 'day') {
        // s.epoch -= ms.minute
        //but don't push it over a month
        if (Math.abs(diff) > 28 && n < 28) {
          s.epoch += milliseconds$1.hour;
        }
      } // 1st time: oops, did we change previous unit? revert it.


      if (previous !== null && startUnit !== s.d[previous]()) {
        // console.warn('spacetime warning: missed setting ' + unit)
        s.epoch = original; // s.epoch += ms[unit] * diff * 0.89 // maybe try and make it close...?
      } //repair it if we've gone too far or something
      //(go by half-steps, just in case)


      var halfStep = milliseconds$1[unit] / 2;

      while (s.d[fn]() < n) {
        s.epoch += halfStep;
      }

      while (s.d[fn]() > n) {
        s.epoch -= halfStep;
      } // 2nd time: did we change previous unit? revert it.


      if (previous !== null && startUnit !== s.d[previous]()) {
        // console.warn('spacetime warning: missed setting ' + unit)
        s.epoch = original;
      }
    }; //find the desired date by a increment/check while loop


    var units$4 = {
      year: {
        valid: function valid(n) {
          return n > -4000 && n < 4000;
        },
        walkTo: function walkTo(s, n) {
          return walk$1(s, n, 'getFullYear', 'year', null);
        }
      },
      month: {
        valid: function valid(n) {
          return n >= 0 && n <= 11;
        },
        walkTo: function walkTo(s, n) {
          var d = s.d;
          var current = d.getMonth();
          var original = s.epoch;
          var startUnit = d.getFullYear();

          if (current === n) {
            return;
          } //try to get it as close as we can..


          var diff = n - current;
          s.epoch += milliseconds$1.day * (diff * 28); //special case
          //oops, did we change the year? revert it.

          if (startUnit !== s.d.getFullYear()) {
            s.epoch = original;
          } //incriment by day


          while (s.d.getMonth() < n) {
            s.epoch += milliseconds$1.day;
          }

          while (s.d.getMonth() > n) {
            s.epoch -= milliseconds$1.day;
          }
        }
      },
      date: {
        valid: function valid(n) {
          return n > 0 && n <= 31;
        },
        walkTo: function walkTo(s, n) {
          return walk$1(s, n, 'getDate', 'day', 'getMonth');
        }
      },
      hour: {
        valid: function valid(n) {
          return n >= 0 && n < 24;
        },
        walkTo: function walkTo(s, n) {
          return walk$1(s, n, 'getHours', 'hour', 'getDate');
        }
      },
      minute: {
        valid: function valid(n) {
          return n >= 0 && n < 60;
        },
        walkTo: function walkTo(s, n) {
          return walk$1(s, n, 'getMinutes', 'minute', 'getHours');
        }
      },
      second: {
        valid: function valid(n) {
          return n >= 0 && n < 60;
        },
        walkTo: function walkTo(s, n) {
          //do this one directly
          s.epoch = s.seconds(n).epoch;
        }
      },
      millisecond: {
        valid: function valid(n) {
          return n >= 0 && n < 1000;
        },
        walkTo: function walkTo(s, n) {
          //do this one directly
          s.epoch = s.milliseconds(n).epoch;
        }
      }
    };

    var walkTo$1 = function walkTo(s, wants) {
      var keys = Object.keys(units$4);
      var old = s.clone();

      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var n = wants[k];

        if (n === undefined) {
          n = old[k]();
        }

        if (typeof n === 'string') {
          n = parseInt(n, 10);
        } //make-sure it's valid


        if (!units$4[k].valid(n)) {
          s.epoch = null;

          if (s.silent === false) {
            console.warn('invalid ' + k + ': ' + n);
          }

          return;
        }

        units$4[k].walkTo(s, n);
      }

      return;
    };

    var walk_1 = walkTo$1;

    var shortMonths$1 = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sept', 'oct', 'nov', 'dec'];
    var longMonths$1 = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

    function buildMapping$1() {
      var obj = {
        sep: 8 //support this format

      };

      for (var i = 0; i < shortMonths$1.length; i++) {
        obj[shortMonths$1[i]] = i;
      }

      for (var _i = 0; _i < longMonths$1.length; _i++) {
        obj[longMonths$1[_i]] = _i;
      }

      return obj;
    }

    var months$2 = {
      "short": function short() {
        return shortMonths$1;
      },
      "long": function long() {
        return longMonths$1;
      },
      mapping: function mapping() {
        return buildMapping$1();
      },
      set: function set(i18n) {
        shortMonths$1 = i18n["short"] || shortMonths$1;
        longMonths$1 = i18n["long"] || longMonths$1;
      }
    };

    //pull-apart ISO offsets, like "+0100"
    var parseOffset$1$1 = function parseOffset(s, offset) {
      if (!offset) {
        return s;
      } //this is a fancy-move


      if (offset === 'Z') {
        offset = '+0000';
      } // according to ISO8601, tz could be hh:mm, hhmm or hh
      // so need few more steps before the calculation.


      var num = 0; // for (+-)hh:mm

      if (/^[\+-]?[0-9]{2}:[0-9]{2}$/.test(offset)) {
        //support "+01:00"
        if (/:00/.test(offset) === true) {
          offset = offset.replace(/:00/, '');
        } //support "+01:30"


        if (/:30/.test(offset) === true) {
          offset = offset.replace(/:30/, '.5');
        }
      } // for (+-)hhmm


      if (/^[\+-]?[0-9]{4}$/.test(offset)) {
        offset = offset.replace(/30$/, '.5');
      }

      num = parseFloat(offset); //divide by 100 or 10 - , "+0100", "+01"

      if (Math.abs(num) > 100) {
        num = num / 100;
      } //okay, try to match it to a utc timezone
      //remember - this is opposite! a -5 offset maps to Etc/GMT+5  ¯\_(:/)_/¯
      //https://askubuntu.com/questions/519550/why-is-the-8-timezone-called-gmt-8-in-the-filesystem


      num *= -1;

      if (num >= 0) {
        num = '+' + num;
      }

      var tz = 'etc/gmt' + num;
      var zones = s.timezones;

      if (zones[tz]) {
        // log a warning if we're over-writing a given timezone?
        // console.log('changing timezone to: ' + tz)
        s.tz = tz;
      }

      return s;
    };

    var parseOffset_1$1 = parseOffset$1$1;

    var parseTime$1 = function parseTime(s) {
      var str = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';
      str = str.replace(/^\s+/, '').toLowerCase(); //trim
      //formal time formats - 04:30.23

      var arr = str.match(/([0-9]{1,2}):([0-9]{1,2}):?([0-9]{1,2})?[:\.]?([0-9]{1,4})?/);

      if (arr !== null) {
        //validate it a little
        var h = Number(arr[1]);

        if (h < 0 || h > 24) {
          return s.startOf('day');
        }

        var m = Number(arr[2]); //don't accept '5:3pm'

        if (arr[2].length < 2 || m < 0 || m > 59) {
          return s.startOf('day');
        }

        s = s.hour(h);
        s = s.minute(m);
        s = s.seconds(arr[3] || 0);
        s = s.millisecond(arr[4] || 0); //parse-out am/pm

        var ampm = str.match(/[\b0-9](am|pm)\b/);

        if (ampm !== null && ampm[1]) {
          s = s.ampm(ampm[1]);
        }

        return s;
      } //try an informal form - 5pm (no minutes)


      arr = str.match(/([0-9]+) ?(am|pm)/);

      if (arr !== null && arr[1]) {
        var _h = Number(arr[1]); //validate it a little..


        if (_h > 12 || _h < 1) {
          return s.startOf('day');
        }

        s = s.hour(arr[1] || 0);
        s = s.ampm(arr[2]);
        s = s.startOf('hour');
        return s;
      } //no time info found, use start-of-day


      s = s.startOf('day');
      return s;
    };

    var parseTime_1 = parseTime$1;

    var monthLengths$1 = [31, // January - 31 days
    28, // February - 28 days in a common year and 29 days in leap years
    31, // March - 31 days
    30, // April - 30 days
    31, // May - 31 days
    30, // June - 30 days
    31, // July - 31 days
    31, // August - 31 days
    30, // September - 30 days
    31, // October - 31 days
    30, // November - 30 days
    31 // December - 31 days
    ];
    var monthLengths_1 = monthLengths$1; // 28 - feb

    var isLeapYear$1 = fns$1.isLeapYear; //given a month, return whether day number exists in it

    var hasDate = function hasDate(obj) {
      //invalid values
      if (monthLengths_1.hasOwnProperty(obj.month) !== true) {
        return false;
      } //support leap-year in february


      if (obj.month === 1) {
        if (isLeapYear$1(obj.year) && obj.date <= 29) {
          return true;
        } else {
          return obj.date <= 28;
        }
      } //is this date too-big for this month?


      var max = monthLengths_1[obj.month] || 0;

      if (obj.date <= max) {
        return true;
      }

      return false;
    };

    var hasDate_1 = hasDate;

    var months$1$1 = months$2.mapping();

    var parseYear$1 = function parseYear() {
      var str = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '';
      var today = arguments.length > 1 ? arguments[1] : undefined;
      var year = parseInt(str.trim(), 10); // use a given year from options.today

      if (!year && today) {
        year = today.year;
      } // fallback to this year


      year = year || new Date().getFullYear();
      return year;
    };

    var strFmt = [//iso-this 1998-05-30T22:00:00:000Z, iso-that 2017-04-03T08:00:00-0700
    {
      reg: /^(\-?0?0?[0-9]{3,4})-([0-9]{1,2})-([0-9]{1,2})[T| ]([0-9.:]+)(Z|[0-9\-\+:]+)?$/,
      parse: function parse(s, arr, givenTz, options) {
        var month = parseInt(arr[2], 10) - 1;
        var obj = {
          year: arr[1],
          month: month,
          date: arr[3]
        };

        if (hasDate_1(obj) === false) {
          s.epoch = null;
          return s;
        }

        parseOffset_1$1(s, arr[5]);
        walk_1(s, obj);
        s = parseTime_1(s, arr[4]);
        return s;
      }
    }, //iso "2015-03-25" or "2015/03/25" or "2015/03/25 12:26:14 PM"
    {
      reg: /^([0-9]{4})[\-\/]([0-9]{1,2})[\-\/]([0-9]{1,2}),?( [0-9]{1,2}:[0-9]{2}:?[0-9]{0,2}? ?(am|pm|gmt))?$/i,
      parse: function parse(s, arr) {
        var obj = {
          year: arr[1],
          month: parseInt(arr[2], 10) - 1,
          date: parseInt(arr[3], 10)
        };

        if (obj.month >= 12) {
          //support yyyy/dd/mm (weird, but ok)
          obj.date = parseInt(arr[2], 10);
          obj.month = parseInt(arr[3], 10) - 1;
        }

        if (hasDate_1(obj) === false) {
          s.epoch = null;
          return s;
        }

        walk_1(s, obj);
        s = parseTime_1(s, arr[4]);
        return s;
      }
    }, //mm/dd/yyyy - uk/canada "6/28/2019, 12:26:14 PM"
    {
      reg: /^([0-9]{1,2})[\-\/]([0-9]{1,2})[\-\/]?([0-9]{4})?,?( [0-9]{1,2}:[0-9]{2}:?[0-9]{0,2}? ?(am|pm|gmt))?$/i,
      parse: function parse(s, arr) {
        var month = parseInt(arr[1], 10) - 1;
        var date = parseInt(arr[2], 10); //support dd/mm/yyy

        if (s.british || month >= 12) {
          date = parseInt(arr[1], 10);
          month = parseInt(arr[2], 10) - 1;
        }

        var year = arr[3] || new Date().getFullYear();
        var obj = {
          year: year,
          month: month,
          date: date
        };

        if (hasDate_1(obj) === false) {
          s.epoch = null;
          return s;
        }

        walk_1(s, obj);
        s = parseTime_1(s, arr[4]);
        return s;
      }
    }, //common british format - "25-feb-2015"
    {
      reg: /^([0-9]{1,2})[\-\/]([a-z]+)[\-\/]?([0-9]{4})?$/i,
      parse: function parse(s, arr) {
        var month = months$1$1[arr[2].toLowerCase()];
        var year = parseYear$1(arr[3], s._today);
        var obj = {
          year: year,
          month: month,
          date: fns$1.toCardinal(arr[1] || '')
        };

        if (hasDate_1(obj) === false) {
          s.epoch = null;
          return s;
        }

        walk_1(s, obj);
        s = parseTime_1(s, arr[4]);
        return s;
      }
    }, //Long "Mar 25 2015"
    //February 22, 2017 15:30:00
    {
      reg: /^([a-z]+) ([0-9]{1,2}(?:st|nd|rd|th)?),?( [0-9]{4})?( ([0-9:]+( ?am| ?pm| ?gmt)?))?$/i,
      parse: function parse(s, arr) {
        var month = months$1$1[arr[1].toLowerCase()];
        var year = parseYear$1(arr[3], s._today);
        var obj = {
          year: year,
          month: month,
          date: fns$1.toCardinal(arr[2] || '')
        };

        if (hasDate_1(obj) === false) {
          s.epoch = null;
          return s;
        }

        walk_1(s, obj);
        s = parseTime_1(s, arr[4]);
        return s;
      }
    }, //February 2017 (implied date)
    {
      reg: /^([a-z]+) ([0-9]{4})$/i,
      parse: function parse(s, arr) {
        var month = months$1$1[arr[1].toLowerCase()];
        var year = parseYear$1(arr[2], s._today);
        var obj = {
          year: year,
          month: month,
          date: s._today.date || 1
        };

        if (hasDate_1(obj) === false) {
          s.epoch = null;
          return s;
        }

        walk_1(s, obj);
        s = parseTime_1(s, arr[4]);
        return s;
      }
    }, //Long "25 Mar 2015"
    {
      reg: /^([0-9]{1,2}(?:st|nd|rd|th)?) ([a-z]+),?( [0-9]{4})?,? ?([0-9]{1,2}:[0-9]{2}:?[0-9]{0,2}? ?(am|pm|gmt))?$/i,
      parse: function parse(s, arr) {
        var month = months$1$1[arr[2].toLowerCase()];

        if (!month) {
          return null;
        }

        var year = parseYear$1(arr[3], s._today);
        var obj = {
          year: year,
          month: month,
          date: fns$1.toCardinal(arr[1])
        };

        if (hasDate_1(obj) === false) {
          s.epoch = null;
          return s;
        }

        walk_1(s, obj);
        s = parseTime_1(s, arr[4]);
        return s;
      }
    }, {
      // '200bc'
      reg: /^[0-9,]+ ?b\.?c\.?$/i,
      parse: function parse(s, arr) {
        var str = arr[0] || ''; //make negative-year

        str = str.replace(/^([0-9,]+) ?b\.?c\.?$/i, '-$1'); //remove commas

        str = str.replace(/,/g, '');
        var year = parseInt(str.trim(), 10);
        var d = new Date();
        var obj = {
          year: year,
          month: d.getMonth(),
          date: d.getDate()
        };

        if (hasDate_1(obj) === false) {
          s.epoch = null;
          return s;
        }

        walk_1(s, obj);
        s = parseTime_1(s);
        return s;
      }
    }, {
      // '200ad'
      reg: /^[0-9,]+ ?(a\.?d\.?|c\.?e\.?)$/i,
      parse: function parse(s, arr) {
        var str = arr[0] || ''; //remove commas

        str = str.replace(/,/g, '');
        var year = parseInt(str.trim(), 10);
        var d = new Date();
        var obj = {
          year: year,
          month: d.getMonth(),
          date: d.getDate()
        };

        if (hasDate_1(obj) === false) {
          s.epoch = null;
          return s;
        }

        walk_1(s, obj);
        s = parseTime_1(s);
        return s;
      }
    }, {
      // '1992'
      reg: /^[0-9]{4}( ?a\.?d\.?)?$/i,
      parse: function parse(s, arr) {
        var today = s._today;
        var year = parseYear$1(arr[0], today);
        var d = new Date(); // using today's date, but a new month is awkward.

        if (today.month && !today.date) {
          today.date = 1;
        }

        var obj = {
          year: year,
          month: today.month || d.getMonth(),
          date: today.date || d.getDate()
        };

        if (hasDate_1(obj) === false) {
          s.epoch = null;
          return s;
        }

        walk_1(s, obj);
        s = parseTime_1(s);
        return s;
      }
    }];
    var strParse = strFmt;

    // pull in 'today' data for the baseline moment
    var getNow$1 = function getNow(s) {
      s.epoch = Date.now();
      Object.keys(s._today || {}).forEach(function (k) {
        if (typeof s[k] === 'function') {
          s = s[k](s._today[k]);
        }
      });
      return s;
    };

    var dates$1 = {
      now: function now(s) {
        return getNow$1(s);
      },
      today: function today(s) {
        return getNow$1(s);
      },
      tonight: function tonight(s) {
        s = getNow$1(s);
        s = s.hour(18); //6pm

        return s;
      },
      tomorrow: function tomorrow(s) {
        s = getNow$1(s);
        s = s.add(1, 'day');
        s = s.startOf('day');
        return s;
      },
      yesterday: function yesterday(s) {
        s = getNow$1(s);
        s = s.subtract(1, 'day');
        s = s.startOf('day');
        return s;
      },
      christmas: function christmas(s) {
        var year = getNow$1(s).year();
        s = s.set([year, 11, 25, 18, 0, 0]); // Dec 25

        return s;
      },
      'new years': function newYears(s) {
        var year = getNow$1(s).year();
        s = s.set([year, 11, 31, 18, 0, 0]); // Dec 31

        return s;
      }
    };
    dates$1['new years eve'] = dates$1['new years'];
    var namedDates = dates$1;

    //  -  can't use built-in js parser ;(
    //=========================================
    // ISO Date	  "2015-03-25"
    // Short Date	"03/25/2015" or "2015/03/25"
    // Long Date	"Mar 25 2015" or "25 Mar 2015"
    // Full Date	"Wednesday March 25 2015"
    //=========================================
    //-- also -
    // if the given epoch is really small, they've probably given seconds and not milliseconds
    // anything below this number is likely (but not necessarily) a mistaken input.
    // this may seem like an arbitrary number, but it's 'within jan 1970'
    // this is only really ambiguous until 2054 or so

    var minimumEpoch = 2500000000;
    var defaults$2 = {
      year: new Date().getFullYear(),
      month: 0,
      date: 1
    }; //support [2016, 03, 01] format

    var handleArray = function handleArray(s, arr, today) {
      var order = ['year', 'month', 'date', 'hour', 'minute', 'second', 'millisecond'];

      for (var i = 0; i < order.length; i++) {
        var num = arr[i] || today[order[i]] || defaults$2[order[i]] || 0;
        s = s[order[i]](num);
      }

      return s;
    }; //support {year:2016, month:3} format


    var handleObject = function handleObject(s, obj, today) {
      obj = Object.assign({}, defaults$2, today, obj);
      var keys = Object.keys(obj);

      for (var i = 0; i < keys.length; i++) {
        var unit = keys[i]; //make sure we have this method

        if (s[unit] === undefined || typeof s[unit] !== 'function') {
          continue;
        } //make sure the value is a number


        if (obj[unit] === null || obj[unit] === undefined || obj[unit] === '') {
          continue;
        }

        var num = obj[unit] || today[unit] || defaults$2[unit] || 0;
        s = s[unit](num);
      }

      return s;
    }; //find the epoch from different input styles


    var parseInput$1 = function parseInput(s, input, givenTz) {
      var today = s._today || defaults$2; //if we've been given a epoch number, it's easy

      if (typeof input === 'number') {
        if (input > 0 && input < minimumEpoch && s.silent === false) {
          console.warn('  - Warning: You are setting the date to January 1970.');
          console.warn('       -   did input seconds instead of milliseconds?');
        }

        s.epoch = input;
        return s;
      } //set tmp time


      s.epoch = Date.now(); // overwrite tmp time with 'today' value, if exists

      if (s._today && fns$1.isObject(s._today) && Object.keys(s._today).length > 0) {
        var res = handleObject(s, today, defaults$2);

        if (res.isValid()) {
          s.epoch = res.epoch;
        }
      } // null input means 'now'


      if (input === null || input === undefined || input === '') {
        return s; //k, we're good.
      } //support input of Date() object


      if (fns$1.isDate(input) === true) {
        s.epoch = input.getTime();
        return s;
      } //support [2016, 03, 01] format


      if (fns$1.isArray(input) === true) {
        s = handleArray(s, input, today);
        return s;
      } //support {year:2016, month:3} format


      if (fns$1.isObject(input) === true) {
        //support spacetime object as input
        if (input.epoch) {
          s.epoch = input.epoch;
          s.tz = input.tz;
          return s;
        }

        s = handleObject(s, input, today);
        return s;
      } //input as a string..


      if (typeof input !== 'string') {
        return s;
      } //little cleanup..


      input = input.replace(/\b(mon|tues|wed|wednes|thu|thurs|fri|sat|satur|sun)(day)?\b/i, '');
      input = input.replace(/,/g, '');
      input = input.replace(/ +/g, ' ').trim(); //try some known-words, like 'now'

      if (namedDates.hasOwnProperty(input) === true) {
        s = namedDates[input](s);
        return s;
      } //try each text-parse template, use the first good result


      for (var i = 0; i < strParse.length; i++) {
        var m = input.match(strParse[i].reg);

        if (m) {
          var _res = strParse[i].parse(s, m, givenTz);

          if (_res !== null) {
            return _res;
          }
        }
      }

      if (s.silent === false) {
        console.warn("Warning: couldn't parse date-string: '" + input + "'");
      }

      s.epoch = null;
      return s;
    };

    var input = parseInput$1;

    var shortDays$1 = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    var longDays$1 = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    var days$1 = {
      "short": function short() {
        return shortDays$1;
      },
      "long": function long() {
        return longDays$1;
      },
      set: function set(i18n) {
        shortDays$1 = i18n["short"] || shortDays$1;
        longDays$1 = i18n["long"] || longDays$1;
      }
    };

    // it's kind of nuts how involved this is
    // "+01:00", "+0100", or simply "+01"

    var isoOffset$1 = function isoOffset(s) {
      var offset = s.timezone().current.offset;
      var isNegative = offset < 0;
      var minute = '00'; //handle 5.5 → '5:30'

      if (Math.abs(offset % 1) === 0.5) {
        minute = '30';

        if (offset >= 0) {
          offset = Math.floor(offset);
        } else {
          offset = Math.ceil(offset);
        }
      }

      if (isNegative) {
        //handle negative sign
        offset *= -1;
        offset = fns$1.zeroPad(offset, 2);
        offset = '-' + offset;
      } else {
        offset = fns$1.zeroPad(offset, 2);
        offset = '+' + offset;
      }

      offset = offset + ':' + minute; //'Z' means 00

      if (offset === '+00:00') {
        offset = 'Z';
      }

      return offset;
    };

    var _offset = isoOffset$1;

    var format$1 = {
      day: function day(s) {
        return fns$1.titleCase(s.dayName());
      },
      'day-short': function dayShort(s) {
        return fns$1.titleCase(days$1["short"]()[s.day()]);
      },
      'day-number': function dayNumber(s) {
        return s.day();
      },
      'day-ordinal': function dayOrdinal(s) {
        return fns$1.ordinal(s.day());
      },
      'day-pad': function dayPad(s) {
        return fns$1.zeroPad(s.day());
      },
      date: function date(s) {
        return s.date();
      },
      'date-ordinal': function dateOrdinal(s) {
        return fns$1.ordinal(s.date());
      },
      'date-pad': function datePad(s) {
        return fns$1.zeroPad(s.date());
      },
      month: function month(s) {
        return fns$1.titleCase(s.monthName());
      },
      'month-short': function monthShort(s) {
        return fns$1.titleCase(months$2["short"]()[s.month()]);
      },
      'month-number': function monthNumber(s) {
        return s.month();
      },
      'month-ordinal': function monthOrdinal(s) {
        return fns$1.ordinal(s.month());
      },
      'month-pad': function monthPad(s) {
        return fns$1.zeroPad(s.month());
      },
      'iso-month': function isoMonth(s) {
        return fns$1.zeroPad(s.month() + 1);
      },
      //1-based months
      year: function year(s) {
        var year = s.year();

        if (year > 0) {
          return year;
        }

        year = Math.abs(year);
        return year + ' BC';
      },
      'year-short': function yearShort(s) {
        var year = s.year();

        if (year > 0) {
          return "'".concat(String(s.year()).substr(2, 4));
        }

        year = Math.abs(year);
        return year + ' BC';
      },
      'iso-year': function isoYear(s) {
        var year = s.year();
        var isNegative = year < 0;
        var str = fns$1.zeroPad(Math.abs(year), 4); //0-padded

        if (isNegative) {
          //negative years are for some reason 6-digits ('-00008')
          str = fns$1.zeroPad(str, 6);
          str = '-' + str;
        }

        return str;
      },
      time: function time(s) {
        return s.time();
      },
      'time-24': function time24(s) {
        return "".concat(s.hour24(), ":").concat(fns$1.zeroPad(s.minute()));
      },
      hour: function hour(s) {
        return s.hour12();
      },
      'hour-pad': function hourPad(s) {
        return fns$1.zeroPad(s.hour12());
      },
      'hour-24': function hour24(s) {
        return s.hour24();
      },
      'hour-24-pad': function hour24Pad(s) {
        return fns$1.zeroPad(s.hour24());
      },
      minute: function minute(s) {
        return s.minute();
      },
      'minute-pad': function minutePad(s) {
        return fns$1.zeroPad(s.minute());
      },
      second: function second(s) {
        return s.second();
      },
      'second-pad': function secondPad(s) {
        return fns$1.zeroPad(s.second());
      },
      ampm: function ampm(s) {
        return s.ampm();
      },
      quarter: function quarter(s) {
        return 'Q' + s.quarter();
      },
      season: function season(s) {
        return s.season();
      },
      era: function era(s) {
        return s.era();
      },
      json: function json(s) {
        return s.json();
      },
      timezone: function timezone(s) {
        return s.timezone().name;
      },
      offset: function offset(s) {
        return _offset(s);
      },
      numeric: function numeric(s) {
        return "".concat(s.year(), "/").concat(fns$1.zeroPad(s.month() + 1), "/").concat(fns$1.zeroPad(s.date()));
      },
      // yyyy/mm/dd
      'numeric-us': function numericUs(s) {
        return "".concat(fns$1.zeroPad(s.month() + 1), "/").concat(fns$1.zeroPad(s.date()), "/").concat(s.year());
      },
      // mm/dd/yyyy
      'numeric-uk': function numericUk(s) {
        return "".concat(fns$1.zeroPad(s.date()), "/").concat(fns$1.zeroPad(s.month() + 1), "/").concat(s.year());
      },
      //dd/mm/yyyy
      'mm/dd': function mmDd(s) {
        return "".concat(fns$1.zeroPad(s.month() + 1), "/").concat(fns$1.zeroPad(s.date()));
      },
      //mm/dd
      // ... https://en.wikipedia.org/wiki/ISO_8601 ;(((
      iso: function iso(s) {
        var year = s.format('iso-year');
        var month = fns$1.zeroPad(s.month() + 1); //1-based months

        var date = fns$1.zeroPad(s.date());
        var hour = fns$1.zeroPad(s.h24());
        var minute = fns$1.zeroPad(s.minute());
        var second = fns$1.zeroPad(s.second());
        var ms = fns$1.zeroPad(s.millisecond(), 3);
        var offset = _offset(s);
        return "".concat(year, "-").concat(month, "-").concat(date, "T").concat(hour, ":").concat(minute, ":").concat(second, ".").concat(ms).concat(offset); //2018-03-09T08:50:00.000-05:00
      },
      'iso-short': function isoShort(s) {
        var month = fns$1.zeroPad(s.month() + 1); //1-based months

        var date = fns$1.zeroPad(s.date());
        return "".concat(s.year(), "-").concat(month, "-").concat(date); //2017-02-15
      },
      'iso-utc': function isoUtc(s) {
        return new Date(s.epoch).toISOString(); //2017-03-08T19:45:28.367Z
      },
      //i made these up
      nice: function nice(s) {
        return "".concat(months$2["short"]()[s.month()], " ").concat(fns$1.ordinal(s.date()), ", ").concat(s.time());
      },
      'nice-year': function niceYear(s) {
        return "".concat(months$2["short"]()[s.month()], " ").concat(fns$1.ordinal(s.date()), ", ").concat(s.year());
      },
      'nice-day': function niceDay(s) {
        return "".concat(days$1["short"]()[s.day()], " ").concat(fns$1.titleCase(months$2["short"]()[s.month()]), " ").concat(fns$1.ordinal(s.date()));
      },
      'nice-full': function niceFull(s) {
        return "".concat(s.dayName(), " ").concat(fns$1.titleCase(s.monthName()), " ").concat(fns$1.ordinal(s.date()), ", ").concat(s.time());
      }
    }; //aliases

    var aliases$2 = {
      'day-name': 'day',
      'month-name': 'month',
      'iso 8601': 'iso',
      'time-h24': 'time-24',
      'time-12': 'time',
      'time-h12': 'time',
      tz: 'timezone',
      'day-num': 'day-number',
      'month-num': 'month-number',
      'month-iso': 'iso-month',
      'year-iso': 'iso-year',
      'nice-short': 'nice',
      mdy: 'numeric-us',
      dmy: 'numeric-uk',
      ymd: 'numeric',
      'yyyy/mm/dd': 'numeric',
      'mm/dd/yyyy': 'numeric-us',
      'dd/mm/yyyy': 'numeric-us',
      'little-endian': 'numeric-uk',
      'big-endian': 'numeric',
      'day-nice': 'nice-day'
    };
    Object.keys(aliases$2).forEach(function (k) {
      return format$1[k] = format$1[aliases$2[k]];
    });

    var printFormat$1 = function printFormat(s) {
      var str = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';

      //don't print anything if it's an invalid date
      if (s.isValid() !== true) {
        return '';
      } //support .format('month')


      if (format$1.hasOwnProperty(str)) {
        var out = format$1[str](s) || '';

        if (str !== 'json') {
          out = String(out);

          if (str !== 'ampm') {
            out = fns$1.titleCase(out);
          }
        }

        return out;
      } //support '{hour}:{minute}' notation


      if (str.indexOf('{') !== -1) {
        var sections = /\{(.+?)\}/g;
        str = str.replace(sections, function (_, fmt) {
          fmt = fmt.toLowerCase().trim();

          if (format$1.hasOwnProperty(fmt)) {
            return String(format$1[fmt](s));
          }

          return '';
        });
        return str;
      }

      return s.format('iso-short');
    };

    var format_1 = printFormat$1;

    var pad = fns$1.zeroPad;
    var formatTimezone$1 = fns$1.formatTimezone; //parse this insane unix-time-templating thing, from the 19th century
    //http://unicode.org/reports/tr35/tr35-25.html#Date_Format_Patterns
    //time-symbols we support

    var mapping$2 = {
      G: function G(s) {
        return s.era();
      },
      GG: function GG(s) {
        return s.era();
      },
      GGG: function GGG(s) {
        return s.era();
      },
      GGGG: function GGGG(s) {
        return s.era() === 'AD' ? 'Anno Domini' : 'Before Christ';
      },
      //year
      y: function y(s) {
        return s.year();
      },
      yy: function yy(s) {
        //last two chars
        return parseInt(String(s.year()).substr(2, 4), 10);
      },
      yyy: function yyy(s) {
        return s.year();
      },
      yyyy: function yyyy(s) {
        return s.year();
      },
      yyyyy: function yyyyy(s) {
        return '0' + s.year();
      },
      // u: (s) => {},//extended non-gregorian years
      //quarter
      Q: function Q(s) {
        return s.quarter();
      },
      QQ: function QQ(s) {
        return s.quarter();
      },
      QQQ: function QQQ(s) {
        return s.quarter();
      },
      QQQQ: function QQQQ(s) {
        return s.quarter();
      },
      //month
      M: function M(s) {
        return s.month() + 1;
      },
      MM: function MM(s) {
        return pad(s.month() + 1);
      },
      MMM: function MMM(s) {
        return s.format('month-short');
      },
      MMMM: function MMMM(s) {
        return s.format('month');
      },
      //week
      w: function w(s) {
        return s.week();
      },
      ww: function ww(s) {
        return pad(s.week());
      },
      //week of month
      // W: (s) => s.week(),
      //date of month
      d: function d(s) {
        return s.date();
      },
      dd: function dd(s) {
        return pad(s.date());
      },
      //date of year
      D: function D(s) {
        return s.dayOfYear();
      },
      DD: function DD(s) {
        return pad(s.dayOfYear());
      },
      DDD: function DDD(s) {
        return pad(s.dayOfYear(), 3);
      },
      // F: (s) => {},//date of week in month
      // g: (s) => {},//modified julian day
      //day
      E: function E(s) {
        return s.format('day-short');
      },
      EE: function EE(s) {
        return s.format('day-short');
      },
      EEE: function EEE(s) {
        return s.format('day-short');
      },
      EEEE: function EEEE(s) {
        return s.format('day');
      },
      EEEEE: function EEEEE(s) {
        return s.format('day')[0];
      },
      e: function e(s) {
        return s.day();
      },
      ee: function ee(s) {
        return s.day();
      },
      eee: function eee(s) {
        return s.format('day-short');
      },
      eeee: function eeee(s) {
        return s.format('day');
      },
      eeeee: function eeeee(s) {
        return s.format('day')[0];
      },
      //am/pm
      a: function a(s) {
        return s.ampm().toUpperCase();
      },
      aa: function aa(s) {
        return s.ampm().toUpperCase();
      },
      aaa: function aaa(s) {
        return s.ampm().toUpperCase();
      },
      aaaa: function aaaa(s) {
        return s.ampm().toUpperCase();
      },
      //hour
      h: function h(s) {
        return s.h12();
      },
      hh: function hh(s) {
        return pad(s.h12());
      },
      H: function H(s) {
        return s.hour();
      },
      HH: function HH(s) {
        return pad(s.hour());
      },
      // j: (s) => {},//weird hour format
      m: function m(s) {
        return s.minute();
      },
      mm: function mm(s) {
        return pad(s.minute());
      },
      s: function s(_s) {
        return _s.second();
      },
      ss: function ss(s) {
        return pad(s.second());
      },
      //milliseconds in the day
      A: function A(s) {
        return s.epoch - s.startOf('day').epoch;
      },
      //timezone
      z: function z(s) {
        return s.timezone().name;
      },
      zz: function zz(s) {
        return s.timezone().name;
      },
      zzz: function zzz(s) {
        return s.timezone().name;
      },
      zzzz: function zzzz(s) {
        return s.timezone().name;
      },
      Z: function Z(s) {
        return formatTimezone$1(s.timezone().current.offset);
      },
      ZZ: function ZZ(s) {
        return formatTimezone$1(s.timezone().current.offset);
      },
      ZZZ: function ZZZ(s) {
        return formatTimezone$1(s.timezone().current.offset);
      },
      ZZZZ: function ZZZZ(s) {
        return formatTimezone$1(s.timezone().current.offset, ':');
      }
    };

    var addAlias$1 = function addAlias(_char, to, n) {
      var name = _char;
      var toName = to;

      for (var i = 0; i < n; i += 1) {
        mapping$2[name] = mapping$2[toName];
        name += _char;
        toName += to;
      }
    };

    addAlias$1('q', 'Q', 4);
    addAlias$1('L', 'M', 4);
    addAlias$1('Y', 'y', 4);
    addAlias$1('c', 'e', 4);
    addAlias$1('k', 'H', 2);
    addAlias$1('K', 'h', 2);
    addAlias$1('S', 's', 2);
    addAlias$1('v', 'z', 4);
    addAlias$1('V', 'Z', 4);

    var unixFmt$1 = function unixFmt(s, str) {
      var chars = str.split(''); //combine consecutive chars, like 'yyyy' as one.

      var arr = [chars[0]];
      var quoteOn = false;

      for (var i = 1; i < chars.length; i += 1) {
        //support quoted substrings
        if (chars[i] === "'") {
          quoteOn = !quoteOn; //support '', meaning one tick

          if (quoteOn === true && chars[i + 1] && chars[i + 1] === "'") {
            quoteOn = true;
          } else {
            continue;
          }
        } //merge it with the last one


        if (quoteOn === true || chars[i] === arr[arr.length - 1][0]) {
          arr[arr.length - 1] += chars[i];
        } else {
          arr.push(chars[i]);
        }
      }

      return arr.reduce(function (txt, c) {
        if (mapping$2[c] !== undefined) {
          txt += mapping$2[c](s) || '';
        } else {
          txt += c;
        }

        return txt;
      }, '');
    };

    var unixFmt_1 = unixFmt$1;

    var units$1$1 = ['year', 'season', 'quarter', 'month', 'week', 'day', 'quarterHour', 'hour', 'minute'];

    var doUnit$1 = function doUnit(s, k) {
      var start = s.clone().startOf(k);
      var end = s.clone().endOf(k);
      var duration = end.epoch - start.epoch;
      var percent = (s.epoch - start.epoch) / duration;
      return parseFloat(percent.toFixed(2));
    }; //how far it is along, from 0-1


    var progress$1 = function progress(s, unit) {
      if (unit) {
        unit = fns$1.normalize(unit);
        return doUnit$1(s, unit);
      }

      var obj = {};
      units$1$1.forEach(function (k) {
        obj[k] = doUnit$1(s, k);
      });
      return obj;
    };

    var progress_1 = progress$1;

    var nearest$1 = function nearest(s, unit) {
      //how far have we gone?
      var prog = s.progress();
      unit = fns$1.normalize(unit); //fix camel-case for this one

      if (unit === 'quarterhour') {
        unit = 'quarterHour';
      }

      if (prog[unit] !== undefined) {
        // go forward one?
        if (prog[unit] > 0.5) {
          s = s.add(1, unit);
        } // go to start


        s = s.startOf(unit);
      } else if (s.silent === false) {
        console.warn("no known unit '" + unit + "'");
      }

      return s;
    };

    var nearest_1 = nearest$1;

    //increment until dates are the same
    var climb$1 = function climb(a, b, unit) {
      var i = 0;
      a = a.clone();

      while (a.isBefore(b)) {
        //do proper, expensive increment to catch all-the-tricks
        a = a.add(1, unit);
        i += 1;
      } //oops, we went too-far..


      if (a.isAfter(b, unit)) {
        i -= 1;
      }

      return i;
    }; // do a thurough +=1 on the unit, until they match
    // for speed-reasons, only used on day, month, week.


    var diffOne$1 = function diffOne(a, b, unit) {
      if (a.isBefore(b)) {
        return climb$1(a, b, unit);
      } else {
        return climb$1(b, a, unit) * -1; //reverse it
      }
    };

    var one = diffOne$1;

    // 2020 - 2019 may be 1 year, or 0 years
    // - '1 year difference' means 366 days during a leap year

    var fastYear$1 = function fastYear(a, b) {
      var years = b.year() - a.year(); // should we decrement it by 1?

      a = a.year(b.year());

      if (a.isAfter(b)) {
        years -= 1;
      }

      return years;
    }; // use a waterfall-method for computing a diff of any 'pre-knowable' units
    // compute years, then compute months, etc..
    // ... then ms-math for any very-small units


    var diff$1 = function diff(a, b) {
      // an hour is always the same # of milliseconds
      // so these units can be 'pre-calculated'
      var msDiff = b.epoch - a.epoch;
      var obj = {
        milliseconds: msDiff,
        seconds: parseInt(msDiff / 1000, 10)
      };
      obj.minutes = parseInt(obj.seconds / 60, 10);
      obj.hours = parseInt(obj.minutes / 60, 10); //do the year

      var tmp = a.clone();
      obj.years = fastYear$1(tmp, b);
      tmp = a.add(obj.years, 'year'); //there's always 12 months in a year...

      obj.months = obj.years * 12;
      tmp = a.add(obj.months, 'month');
      obj.months += one(tmp, b, 'month'); // there's always atleast 52 weeks in a year..
      // (month * 4) isn't as close

      obj.weeks = obj.years * 52;
      tmp = a.add(obj.weeks, 'week');
      obj.weeks += one(tmp, b, 'week'); // there's always atleast 7 days in a week

      obj.days = obj.weeks * 7;
      tmp = a.add(obj.days, 'day');
      obj.days += one(tmp, b, 'day');
      return obj;
    };

    var waterfall = diff$1;

    var reverseDiff$1 = function reverseDiff(obj) {
      Object.keys(obj).forEach(function (k) {
        obj[k] *= -1;
      });
      return obj;
    }; // this method counts a total # of each unit, between a, b.
    // '1 month' means 28 days in february
    // '1 year' means 366 days in a leap year


    var main$2 = function main(a, b, unit) {
      b = fns$1.beADate(b, a); //reverse values, if necessary

      var reversed = false;

      if (a.isAfter(b)) {
        var tmp = a;
        a = b;
        b = tmp;
        reversed = true;
      } //compute them all (i know!)


      var obj = waterfall(a, b);

      if (reversed) {
        obj = reverseDiff$1(obj);
      } //return just the requested unit


      if (unit) {
        //make sure it's plural-form
        unit = fns$1.normalize(unit);

        if (/s$/.test(unit) !== true) {
          unit += 's';
        }

        if (unit === 'dates') {
          unit = 'days';
        }

        return obj[unit];
      }

      return obj;
    };

    var diff$1$1 = main$2;

    //our conceptual 'break-points' for each unit

    var qualifiers$1 = {
      months: {
        almost: 10,
        over: 4
      },
      days: {
        almost: 25,
        over: 10
      },
      hours: {
        almost: 20,
        over: 8
      },
      minutes: {
        almost: 50,
        over: 20
      },
      seconds: {
        almost: 50,
        over: 20
      }
    }; //get number of hours/minutes... between the two dates

    function getDiff$1(a, b) {
      var isBefore = a.isBefore(b);
      var later = isBefore ? b : a;
      var earlier = isBefore ? a : b;
      earlier = earlier.clone();
      var diff = {
        years: 0,
        months: 0,
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0
      };
      Object.keys(diff).forEach(function (unit) {
        if (earlier.isSame(later, unit)) {
          return;
        }

        var max = earlier.diff(later, unit);
        earlier = earlier.add(max, unit);
        diff[unit] = max;
      }); //reverse it, if necessary

      if (isBefore) {
        Object.keys(diff).forEach(function (u) {
          if (diff[u] !== 0) {
            diff[u] *= -1;
          }
        });
      }

      return diff;
    } // Expects a plural unit arg


    function pluralize$1(value, unit) {
      if (value === 1) {
        unit = unit.slice(0, -1);
      }

      return value + ' ' + unit;
    } //create the human-readable diff between the two dates


    var since$1 = function since(start, end) {
      end = fns$1.beADate(end, start);
      var diff = getDiff$1(start, end);
      var isNow = Object.keys(diff).every(function (u) {
        return !diff[u];
      });

      if (isNow === true) {
        return {
          diff: diff,
          rounded: 'now',
          qualified: 'now',
          precise: 'now'
        };
      }

      var rounded;
      var qualified;
      var precise;
      var englishValues = []; //go through each value and create its text-representation

      Object.keys(diff).forEach(function (unit, i, units) {
        var value = Math.abs(diff[unit]);

        if (value === 0) {
          return;
        }

        var englishValue = pluralize$1(value, unit);
        englishValues.push(englishValue);

        if (!rounded) {
          rounded = qualified = englishValue;

          if (i > 4) {
            return;
          } //is it a 'almost' something, etc?


          var nextUnit = units[i + 1];
          var nextValue = Math.abs(diff[nextUnit]);

          if (nextValue > qualifiers$1[nextUnit].almost) {
            rounded = pluralize$1(value + 1, unit);
            qualified = 'almost ' + rounded;
          } else if (nextValue > qualifiers$1[nextUnit].over) qualified = 'over ' + englishValue;
        }
      }); //make them into a string

      precise = englishValues.splice(0, 2).join(', '); //handle before/after logic

      if (start.isAfter(end) === true) {
        rounded += ' ago';
        qualified += ' ago';
        precise += ' ago';
      } else {
        rounded = 'in ' + rounded;
        qualified = 'in ' + qualified;
        precise = 'in ' + precise;
      }

      return {
        diff: diff,
        rounded: rounded,
        qualified: qualified,
        precise: precise
      };
    };

    var since_1 = since$1;

    //https://www.timeanddate.com/calendar/aboutseasons.html
    // Spring - from March 1 to May 31;
    // Summer - from June 1 to August 31;
    // Fall (autumn) - from September 1 to November 30; and,
    // Winter - from December 1 to February 28 (February 29 in a leap year).
    var seasons$1 = {
      north: [['spring', 2, 1], //spring march 1
      ['summer', 5, 1], //june 1
      ['fall', 8, 1], //sept 1
      ['autumn', 8, 1], //sept 1
      ['winter', 11, 1] //dec 1
      ],
      south: [['fall', 2, 1], //march 1
      ['autumn', 2, 1], //march 1
      ['winter', 5, 1], //june 1
      ['spring', 8, 1], //sept 1
      ['summer', 11, 1] //dec 1
      ]
    };

    var quarters$1 = [null, [0, 1], //jan 1
    [3, 1], //apr 1
    [6, 1], //july 1
    [9, 1] //oct 1
    ];

    var units$2$1 = {
      minute: function minute(s) {
        walk_1(s, {
          second: 0,
          millisecond: 0
        });
        return s;
      },
      quarterhour: function quarterhour(s) {
        var minute = s.minutes();

        if (minute >= 45) {
          s = s.minutes(45);
        } else if (minute >= 30) {
          s = s.minutes(30);
        } else if (minute >= 15) {
          s = s.minutes(15);
        } else {
          s = s.minutes(0);
        }

        walk_1(s, {
          second: 0,
          millisecond: 0
        });
        return s;
      },
      hour: function hour(s) {
        walk_1(s, {
          minute: 0,
          second: 0,
          millisecond: 0
        });
        return s;
      },
      day: function day(s) {
        walk_1(s, {
          hour: 0,
          minute: 0,
          second: 0,
          millisecond: 0
        });
        return s;
      },
      week: function week(s) {
        var original = s.clone();
        s = s.day(s._weekStart); //monday

        if (s.isAfter(original)) {
          s = s.subtract(1, 'week');
        }

        walk_1(s, {
          hour: 0,
          minute: 0,
          second: 0,
          millisecond: 0
        });
        return s;
      },
      month: function month(s) {
        walk_1(s, {
          date: 1,
          hour: 0,
          minute: 0,
          second: 0,
          millisecond: 0
        });
        return s;
      },
      quarter: function quarter(s) {
        var q = s.quarter();

        if (quarters$1[q]) {
          walk_1(s, {
            month: quarters$1[q][0],
            date: quarters$1[q][1],
            hour: 0,
            minute: 0,
            second: 0,
            millisecond: 0
          });
        }

        return s;
      },
      season: function season(s) {
        var current = s.season();
        var hem = 'north';

        if (s.hemisphere() === 'South') {
          hem = 'south';
        }

        for (var i = 0; i < seasons$1[hem].length; i++) {
          if (seasons$1[hem][i][0] === current) {
            //winter goes between years
            var year = s.year();

            if (current === 'winter' && s.month() < 3) {
              year -= 1;
            }

            walk_1(s, {
              year: year,
              month: seasons$1[hem][i][1],
              date: seasons$1[hem][i][2],
              hour: 0,
              minute: 0,
              second: 0,
              millisecond: 0
            });
            return s;
          }
        }

        return s;
      },
      year: function year(s) {
        walk_1(s, {
          month: 0,
          date: 1,
          hour: 0,
          minute: 0,
          second: 0,
          millisecond: 0
        });
        return s;
      },
      decade: function decade(s) {
        s = s.startOf('year');
        var year = s.year();
        var decade = parseInt(year / 10, 10) * 10;
        s = s.year(decade);
        return s;
      },
      century: function century(s) {
        s = s.startOf('year');
        var year = s.year(); // near 0AD goes '-1 | +1'

        var decade = parseInt(year / 100, 10) * 100;
        s = s.year(decade);
        return s;
      }
    };
    units$2$1.date = units$2$1.day;

    var startOf$1 = function startOf(a, unit) {
      var s = a.clone();
      unit = fns$1.normalize(unit);

      if (units$2$1[unit]) {
        return units$2$1[unit](s);
      }

      if (unit === 'summer' || unit === 'winter') {
        s = s.season(unit);
        return units$2$1.season(s);
      }

      return s;
    }; //piggy-backs off startOf


    var endOf$1 = function endOf(a, unit) {
      var s = a.clone();
      unit = fns$1.normalize(unit);

      if (units$2$1[unit]) {
        s = units$2$1[unit](s);
        s = s.add(1, unit);
        s = s.subtract(1, 'milliseconds');
        return s;
      }

      return s;
    };

    var startOf_1 = {
      startOf: startOf$1,
      endOf: endOf$1
    };

    var isDay$1 = function isDay(unit) {
      if (days$1["short"]().find(function (s) {
        return s === unit;
      })) {
        return true;
      }

      if (days$1["long"]().find(function (s) {
        return s === unit;
      })) {
        return true;
      }

      return false;
    }; // return a list of the weeks/months/days between a -> b
    // returns spacetime objects in the timezone of the input


    var every$1 = function every(start) {
      var unit = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';
      var end = arguments.length > 2 ? arguments[2] : undefined;

      if (!unit || !end) {
        return [];
      } //cleanup unit param


      unit = fns$1.normalize(unit); //cleanup to param

      end = start.clone().set(end); //swap them, if they're backwards

      if (start.isAfter(end)) {
        var tmp = start;
        start = end;
        end = tmp;
      } //support 'every wednesday'


      var d = start.clone();

      if (isDay$1(unit)) {
        d = d.next(unit);
        unit = 'week';
      } else {
        d = d.next(unit);
      } //okay, actually start doing it


      var result = [];

      while (d.isBefore(end)) {
        result.push(d);
        d = d.add(1, unit);
      }

      return result;
    };

    var every_1 = every$1;

    var parseDst$1 = function parseDst(dst) {
      if (!dst) {
        return [];
      }

      return dst.split('->');
    };

    var titleCase$2 = function titleCase(str) {
      str = str[0].toUpperCase() + str.substr(1);
      str = str.replace(/\/gmt/, '/GMT');
      str = str.replace(/[\/_]([a-z])/gi, function (s) {
        return s.toUpperCase();
      });
      return str;
    }; //get metadata about this timezone


    var timezone$1 = function timezone(s) {
      var zones = s.timezones;
      var tz = s.tz;

      if (zones.hasOwnProperty(tz) === false) {
        tz = find(s.tz, zones);
      }

      if (tz === null) {
        if (s.silent === false) {
          console.warn("Warn: could not find given or local timezone - '" + s.tz + "'");
        }

        return {
          current: {
            epochShift: 0
          }
        };
      }

      var found = zones[tz];
      var result = {
        name: titleCase$2(tz),
        hasDst: Boolean(found.dst),
        default_offset: found.offset,
        //do north-hemisphere version as default (sorry!)
        hemisphere: found.hem === 's' ? 'South' : 'North',
        current: {}
      };

      if (result.hasDst) {
        var arr = parseDst$1(found.dst);
        result.change = {
          start: arr[0],
          back: arr[1]
        };
      } //find the offsets for summer/winter times
      //(these variable names are north-centric)


      var summer = found.offset; // (july)

      var winter = summer; // (january) assume it's the same for now

      if (result.hasDst === true) {
        if (result.hemisphere === 'North') {
          winter = summer - 1;
        } else {
          //southern hemisphere
          winter = found.offset + 1;
        }
      } //find out which offset to use right now
      //use 'summer' time july-time


      if (result.hasDst === false) {
        result.current.offset = summer;
        result.current.isDST = false;
      } else if (summerTime(s.epoch, result.change.start, result.change.back, summer) === true) {
        result.current.offset = summer;
        result.current.isDST = result.hemisphere === 'North'; //dst 'on' in winter in north
      } else {
        //use 'winter' january-time
        result.current.offset = winter;
        result.current.isDST = result.hemisphere === 'South'; //dst 'on' in summer in south
      }

      return result;
    };

    var timezone_1 = timezone$1;

    var units$3$1 = ['century', 'decade', 'year', 'month', 'date', 'day', 'hour', 'minute', 'second', 'millisecond']; //the spacetime instance methods (also, the API)

    var methods$5 = {
      set: function set(input$1, tz) {
        var s = this.clone();
        s = input(s, input$1, null);

        if (tz) {
          this.tz = find(tz);
        }

        return s;
      },
      timezone: function timezone() {
        return timezone_1(this);
      },
      isDST: function isDST() {
        return timezone_1(this).current.isDST;
      },
      hasDST: function hasDST() {
        return timezone_1(this).hasDst;
      },
      offset: function offset() {
        return timezone_1(this).current.offset * 60;
      },
      hemisphere: function hemisphere() {
        return timezone_1(this).hemisphere;
      },
      format: function format(fmt) {
        return format_1(this, fmt);
      },
      unixFmt: function unixFmt(fmt) {
        return unixFmt_1(this, fmt);
      },
      startOf: function startOf(unit) {
        return startOf_1.startOf(this, unit);
      },
      endOf: function endOf(unit) {
        return startOf_1.endOf(this, unit);
      },
      leapYear: function leapYear() {
        var year = this.year();
        return fns$1.isLeapYear(year);
      },
      progress: function progress(unit) {
        return progress_1(this, unit);
      },
      nearest: function nearest(unit) {
        return nearest_1(this, unit);
      },
      diff: function diff(d, unit) {
        return diff$1$1(this, d, unit);
      },
      since: function since(d) {
        if (!d) {
          d = this.clone().set();
        }

        return since_1(this, d);
      },
      next: function next(unit) {
        var s = this.add(1, unit);
        return s.startOf(unit);
      },
      //the start of the previous year/week/century
      last: function last(unit) {
        var s = this.subtract(1, unit);
        return s.startOf(unit);
      },
      isValid: function isValid() {
        //null/undefined epochs
        if (!this.epoch && this.epoch !== 0) {
          return false;
        }

        return !isNaN(this.d.getTime());
      },
      //travel to this timezone
      "goto": function goto(tz) {
        var s = this.clone();
        s.tz = find(tz, s.timezones); //science!

        return s;
      },
      //get each week/month/day between a -> b
      every: function every(unit, to) {
        return every_1(this, unit, to);
      },
      isAwake: function isAwake() {
        var hour = this.hour(); //10pm -> 8am

        if (hour < 8 || hour > 22) {
          return false;
        }

        return true;
      },
      isAsleep: function isAsleep() {
        return !this.isAwake();
      },
      //pretty-printing
      log: function log() {
        console.log('');
        console.log(format_1(this, 'nice-short'));
        return this;
      },
      logYear: function logYear() {
        console.log('');
        console.log(format_1(this, 'full-short'));
        return this;
      },
      json: function json() {
        var _this = this;

        return units$3$1.reduce(function (h, unit) {
          h[unit] = _this[unit]();
          return h;
        }, {});
      },
      debug: function debug() {
        var tz = this.timezone();
        var date = this.format('MM') + ' ' + this.format('date-ordinal') + ' ' + this.year();
        date += '\n     - ' + this.format('time');
        console.log('\n\n', date + '\n     - ' + tz.name + ' (' + tz.current.offset + ')');
        return this;
      },
      //alias of 'since' but opposite - like moment.js
      from: function from(d) {
        d = this.clone().set(d);
        return d.since(this);
      },
      fromNow: function fromNow() {
        var d = this.clone().set(Date.now());
        return d.since(this);
      },
      weekStart: function weekStart(input) {
        //accept a number directly
        if (typeof input === 'number') {
          this._weekStart = input;
          return this;
        }

        if (typeof input === 'string') {
          // accept 'wednesday'
          input = input.toLowerCase().trim();
          var num = days$1["short"]().indexOf(input);

          if (num === -1) {
            num = days$1["long"]().indexOf(input);
          }

          if (num === -1) {
            num = 1; //go back to default
          }

          this._weekStart = num;
        } else {
          console.warn('Spacetime Error: Cannot understand .weekStart() input:', input);
        }

        return this;
      }
    }; // aliases

    methods$5.inDST = methods$5.isDST;
    methods$5.round = methods$5.nearest;
    methods$5.each = methods$5.every;
    var methods_1 = methods$5;

    //these methods wrap around them.

    var isLeapYear$1$1 = fns$1.isLeapYear;

    var validate$2 = function validate(n) {
      //handle number as a string
      if (typeof n === 'string') {
        n = parseInt(n, 10);
      }

      return n;
    };

    var order$2 = ['year', 'month', 'date', 'hour', 'minute', 'second', 'millisecond']; //reduce hostile micro-changes when moving dates by millisecond

    var confirm$1 = function confirm(s, tmp, unit) {
      var n = order$2.indexOf(unit);
      var arr = order$2.slice(n, order$2.length);

      for (var i = 0; i < arr.length; i++) {
        var want = tmp[arr[i]]();
        s[arr[i]](want);
      }

      return s;
    };

    var set$4 = {
      milliseconds: function milliseconds(s, n) {
        n = validate$2(n);
        var current = s.millisecond();
        var diff = current - n; //milliseconds to shift by

        return s.epoch - diff;
      },
      seconds: function seconds(s, n) {
        n = validate$2(n);
        var diff = s.second() - n;
        var shift = diff * milliseconds$1.second;
        return s.epoch - shift;
      },
      minutes: function minutes(s, n) {
        n = validate$2(n);
        var old = s.clone();
        var diff = s.minute() - n;
        var shift = diff * milliseconds$1.minute;
        s.epoch -= shift; // check against a screw-up
        // if (old.hour() != s.hour()) {
        //   walkTo(old, {
        //     minute: n
        //   })
        //   return old.epoch
        // }

        confirm$1(s, old, 'second');
        return s.epoch;
      },
      hours: function hours(s, n) {
        n = validate$2(n);

        if (n >= 24) {
          n = 24;
        } else if (n < 0) {
          n = 0;
        }

        var old = s.clone();
        var diff = s.hour() - n;
        var shift = diff * milliseconds$1.hour;
        s.epoch -= shift;
        walk_1(s, {
          hour: n
        });
        confirm$1(s, old, 'minute');
        return s.epoch;
      },
      //support setting time by '4:25pm' - this isn't very-well developed..
      time: function time(s, str) {
        var m = str.match(/([0-9]{1,2}):([0-9]{1,2})(am|pm)?/);

        if (!m) {
          //fallback to support just '2am'
          m = str.match(/([0-9]{1,2})(am|pm)/);

          if (!m) {
            return s.epoch;
          }

          m.splice(2, 0, '0'); //add implicit 0 minutes
        }

        var h24 = false;
        var hour = parseInt(m[1], 10);
        var minute = parseInt(m[2], 10);

        if (hour > 12) {
          h24 = true;
        } //make the hour into proper 24h time


        if (h24 === false) {
          if (m[3] === 'am' && hour === 12) {
            //12am is midnight
            hour = 0;
          }

          if (m[3] === 'pm' && hour < 12) {
            //12pm is noon
            hour += 12;
          }
        }

        s = s.hour(hour);
        s = s.minute(minute);
        s = s.second(0);
        s = s.millisecond(0);
        return s.epoch;
      },
      date: function date(s, n) {
        n = validate$2(n); //avoid setting february 31st

        if (n > 28) {
          var month = s.month();
          var max = monthLengths_1[month]; // support leap day in february

          if (month === 1 && n === 29 && isLeapYear$1$1(s.year())) {
            max = 29;
          }

          if (n > max) {
            n = max;
          }
        } //avoid setting < 0


        if (n <= 0) {
          n = 1;
        }

        walk_1(s, {
          date: n
        });
        return s.epoch;
      },
      //this one's tricky
      month: function month(s, n) {
        if (typeof n === 'string') {
          n = months$2.mapping()[n.toLowerCase()];
        }

        n = validate$2(n); //don't go past december

        if (n >= 12) {
          n = 11;
        }

        if (n <= 0) {
          n = 0;
        }

        var date = s.date(); //there's no 30th of february, etc.

        if (date > monthLengths_1[n]) {
          //make it as close as we can..
          date = monthLengths_1[n];
        }

        walk_1(s, {
          month: n,
          date: date
        });
        return s.epoch;
      },
      year: function year(s, n) {
        n = validate$2(n);
        walk_1(s, {
          year: n
        });
        return s.epoch;
      },
      dayOfYear: function dayOfYear(s, n) {
        n = validate$2(n);
        var old = s.clone();
        n -= 1; //days are 1-based

        if (n <= 0) {
          n = 0;
        } else if (n >= 365) {
          n = 364;
        }

        s = s.startOf('year');
        s = s.add(n, 'day');
        confirm$1(s, old, 'hour');
        return s.epoch;
      }
    };

    var methods$1$1 = {
      millisecond: function millisecond(num) {
        if (num !== undefined) {
          var s = this.clone();
          s.epoch = set$4.milliseconds(s, num);
          return s;
        }

        return this.d.getMilliseconds();
      },
      second: function second(num) {
        if (num !== undefined) {
          var s = this.clone();
          s.epoch = set$4.seconds(s, num);
          return s;
        }

        return this.d.getSeconds();
      },
      minute: function minute(num) {
        if (num !== undefined) {
          var s = this.clone();
          s.epoch = set$4.minutes(s, num);
          return s;
        }

        return this.d.getMinutes();
      },
      hour: function hour(num) {
        var d = this.d;

        if (num !== undefined) {
          var s = this.clone();
          s.epoch = set$4.hours(s, num);
          return s;
        }

        return d.getHours();
      },
      //'3:30' is 3.5
      hourFloat: function hourFloat(num) {
        if (num !== undefined) {
          var s = this.clone();

          var _minute = num % 1;

          _minute = _minute * 60;

          var _hour = parseInt(num, 10);

          s.epoch = set$4.hours(s, _hour);
          s.epoch = set$4.minutes(s, _minute);
          return s;
        }

        var d = this.d;
        var hour = d.getHours();
        var minute = d.getMinutes();
        minute = minute / 60;
        return hour + minute;
      },
      // hour in 12h format
      hour12: function hour12(str) {
        var d = this.d;

        if (str !== undefined) {
          var s = this.clone();
          str = '' + str;
          var m = str.match(/^([0-9]+)(am|pm)$/);

          if (m) {
            var hour = parseInt(m[1], 10);

            if (m[2] === 'pm') {
              hour += 12;
            }

            s.epoch = set$4.hours(s, hour);
          }

          return s;
        } //get the hour


        var hour12 = d.getHours();

        if (hour12 > 12) {
          hour12 = hour12 - 12;
        }

        if (hour12 === 0) {
          hour12 = 12;
        }

        return hour12;
      },
      //some ambiguity here with 12/24h
      time: function time(str) {
        if (str !== undefined) {
          var s = this.clone();
          s.epoch = set$4.time(s, str);
          return s;
        }

        return "".concat(this.h12(), ":").concat(fns$1.zeroPad(this.minute())).concat(this.ampm());
      },
      // either 'am' or 'pm'
      ampm: function ampm(input) {
        var which = 'am';
        var hour = this.hour();

        if (hour >= 12) {
          which = 'pm';
        }

        if (typeof input !== 'string') {
          return which;
        } //okay, we're doing a setter


        var s = this.clone();
        input = input.toLowerCase().trim(); //ampm should never change the day
        // - so use `.hour(n)` instead of `.minus(12,'hour')`

        if (hour >= 12 && input === 'am') {
          //noon is 12pm
          hour -= 12;
          return s.hour(hour);
        }

        if (hour < 12 && input === 'pm') {
          hour += 12;
          return s.hour(hour);
        }

        return s;
      },
      //some hard-coded times of day, like 'noon'
      dayTime: function dayTime(str) {
        if (str !== undefined) {
          var times = {
            morning: '7:00am',
            breakfast: '7:00am',
            noon: '12:00am',
            lunch: '12:00pm',
            afternoon: '2:00pm',
            evening: '6:00pm',
            dinner: '6:00pm',
            night: '11:00pm',
            midnight: '23:59pm'
          };
          var s = this.clone();
          str = str || '';
          str = str.toLowerCase();

          if (times.hasOwnProperty(str) === true) {
            s = s.time(times[str]);
          }

          return s;
        }

        var h = this.hour();

        if (h < 6) {
          return 'night';
        }

        if (h < 12) {
          //until noon
          return 'morning';
        }

        if (h < 17) {
          //until 5pm
          return 'afternoon';
        }

        if (h < 22) {
          //until 10pm
          return 'evening';
        }

        return 'night';
      },
      //parse a proper iso string
      iso: function iso(num) {
        if (num !== undefined) {
          return this.set(num);
        }

        return this.format('iso');
      }
    };
    var _01Time = methods$1$1;

    var methods$2$1 = {
      // # day in the month
      date: function date(num) {
        if (num !== undefined) {
          var s = this.clone();
          s.epoch = set$4.date(s, num);
          return s;
        }

        return this.d.getDate();
      },
      //like 'wednesday' (hard!)
      day: function day(input) {
        if (input === undefined) {
          return this.d.getDay();
        }

        var original = this.clone();
        var want = input; // accept 'wednesday'

        if (typeof input === 'string') {
          input = input.toLowerCase();
          want = days$1["short"]().indexOf(input);

          if (want === -1) {
            want = days$1["long"]().indexOf(input);
          }
        } //move approx


        var day = this.d.getDay();
        var diff = day - want;
        var s = this.subtract(diff * 24, 'hours'); //tighten it back up

        walk_1(s, {
          hour: original.hour(),
          minute: original.minute(),
          second: original.second()
        });
        return s;
      },
      //these are helpful name-wrappers
      dayName: function dayName(input) {
        if (input === undefined) {
          return days$1["long"]()[this.day()];
        }

        var s = this.clone();
        s = s.day(input);
        return s;
      },
      //either name or number
      month: function month(input) {
        if (input !== undefined) {
          var s = this.clone();
          s.epoch = set$4.month(s, input);
          return s;
        }

        return this.d.getMonth();
      }
    };
    var _02Date = methods$2$1;

    var clearMinutes$1 = function clearMinutes(s) {
      s = s.minute(0);
      s = s.second(0);
      s = s.millisecond(1);
      return s;
    };

    var methods$3$1 = {
      // day 0-366
      dayOfYear: function dayOfYear(num) {
        if (num !== undefined) {
          var s = this.clone();
          s.epoch = set$4.dayOfYear(s, num);
          return s;
        } //days since newyears - jan 1st is 1, jan 2nd is 2...


        var sum = 0;
        var month = this.d.getMonth();
        var tmp; //count the num days in each month

        for (var i = 1; i <= month; i++) {
          tmp = new Date();
          tmp.setDate(1);
          tmp.setFullYear(this.d.getFullYear()); //the year matters, because leap-years

          tmp.setHours(1);
          tmp.setMinutes(1);
          tmp.setMonth(i);
          tmp.setHours(-2); //the last day of the month

          sum += tmp.getDate();
        }

        return sum + this.d.getDate();
      },
      //since the start of the year
      week: function week(num) {
        // week-setter
        if (num !== undefined) {
          var s = this.clone();
          s = s.month(0);
          s = s.date(1);
          s = s.day('monday');
          s = clearMinutes$1(s); //don't go into last-year

          if (s.monthName() === 'december') {
            s = s.add(1, 'week');
          }

          num -= 1; //1-based

          s = s.add(num, 'weeks');
          return s;
        } //find-out which week it is


        var tmp = this.clone();
        tmp = tmp.month(0);
        tmp = tmp.date(1);
        tmp = clearMinutes$1(tmp);
        tmp = tmp.day('monday'); //don't go into last-year

        if (tmp.monthName() === 'december') {
          tmp = tmp.add(1, 'week');
        } // is first monday the 1st?


        var toAdd = 1;

        if (tmp.date() === 1) {
          toAdd = 0;
        }

        tmp = tmp.minus(1, 'second');
        var thisOne = this.epoch; //if the week technically hasn't started yet

        if (tmp.epoch > thisOne) {
          return 1;
        } //speed it up, if we can


        var i = 0;
        var skipWeeks = this.month() * 4;
        tmp.epoch += milliseconds$1.week * skipWeeks;
        i += skipWeeks;

        for (; i < 52; i++) {
          if (tmp.epoch > thisOne) {
            return i + toAdd;
          }

          tmp = tmp.add(1, 'week');
        }

        return 52;
      },
      //'january'
      monthName: function monthName(input) {
        if (input === undefined) {
          return months$2["long"]()[this.month()];
        }

        var s = this.clone();
        s = s.month(input);
        return s;
      },
      //q1, q2, q3, q4
      quarter: function quarter(num) {
        if (num !== undefined) {
          if (typeof num === 'string') {
            num = num.replace(/^q/i, '');
            num = parseInt(num, 10);
          }

          if (quarters$1[num]) {
            var s = this.clone();
            var _month = quarters$1[num][0];
            s = s.month(_month);
            s = s.date(1);
            s = s.startOf('day');
            return s;
          }
        }

        var month = this.d.getMonth();

        for (var i = 1; i < quarters$1.length; i++) {
          if (month < quarters$1[i][0]) {
            return i - 1;
          }
        }

        return 4;
      },
      //spring, summer, winter, fall
      season: function season(input) {
        var hem = 'north';

        if (this.hemisphere() === 'South') {
          hem = 'south';
        }

        if (input !== undefined) {
          var s = this.clone();

          for (var i = 0; i < seasons$1[hem].length; i++) {
            if (input === seasons$1[hem][i][0]) {
              s = s.month(seasons$1[hem][i][1]);
              s = s.date(1);
              s = s.startOf('day');
            }
          }

          return s;
        }

        var month = this.d.getMonth();

        for (var _i = 0; _i < seasons$1[hem].length - 1; _i++) {
          if (month >= seasons$1[hem][_i][1] && month < seasons$1[hem][_i + 1][1]) {
            return seasons$1[hem][_i][0];
          }
        }

        return 'winter';
      },
      //the year number
      year: function year(num) {
        if (num !== undefined) {
          var s = this.clone();
          s.epoch = set$4.year(s, num);
          return s;
        }

        return this.d.getFullYear();
      },
      //bc/ad years
      era: function era(str) {
        if (str !== undefined) {
          var s = this.clone();
          str = str.toLowerCase(); //TODO: there is no year-0AD i think. may have off-by-1 error here

          var year = s.d.getFullYear(); //make '1992' into 1992bc..

          if (str === 'bc' && year > 0) {
            s.epoch = set$4.year(s, year * -1);
          } //make '1992bc' into '1992'


          if (str === 'ad' && year < 0) {
            s.epoch = set$4.year(s, year * -1);
          }

          return s;
        }

        if (this.d.getFullYear() < 0) {
          return 'BC';
        }

        return 'AD';
      },
      // 2019 -> 2010
      decade: function decade(input) {
        if (input !== undefined) {
          input = String(input);
          input = input.replace(/([0-9])'?s$/, '$1'); //1950's

          input = input.replace(/([0-9])(th|rd|st|nd)/, '$1'); //fix ordinals

          if (!input) {
            console.warn('Spacetime: Invalid decade input');
            return this;
          } // assume 20th century?? for '70s'.


          if (input.length === 2 && /[0-9][0-9]/.test(input)) {
            input = '19' + input;
          }

          var year = Number(input);

          if (isNaN(year)) {
            return this;
          } // round it down to the decade


          year = Math.floor(year / 10) * 10;
          return this.year(year); //.startOf('decade')
        }

        return this.startOf('decade').year();
      },
      // 1950 -> 19+1
      century: function century(input) {
        if (input !== undefined) {
          if (typeof input === 'string') {
            input = input.replace(/([0-9])(th|rd|st|nd)/, '$1'); //fix ordinals

            input = input.replace(/([0-9]+) ?(b\.?c\.?|a\.?d\.?)/i, function (a, b, c) {
              if (c.match(/b\.?c\.?/i)) {
                b = '-' + b;
              }

              return b;
            });
            input = input.replace(/c$/, ''); //20thC
          }

          var year = Number(input);

          if (isNaN(input)) {
            console.warn('Spacetime: Invalid century input');
            return this;
          } // there is no century 0


          if (year === 0) {
            year = 1;
          }

          if (year >= 0) {
            year = (year - 1) * 100;
          } else {
            year = (year + 1) * 100;
          }

          return this.year(year);
        } // century getter


        var num = this.startOf('century').year();
        num = Math.floor(num / 100);

        if (num < 0) {
          return num - 1;
        }

        return num + 1;
      },
      // 2019 -> 2+1
      millenium: function millenium(input) {
        if (input !== undefined) {
          if (typeof input === 'string') {
            input = input.replace(/([0-9])(th|rd|st|nd)/, '$1'); //fix ordinals

            input = Number(input);

            if (isNaN(input)) {
              console.warn('Spacetime: Invalid millenium input');
              return this;
            }
          }

          if (input > 0) {
            input -= 1;
          }

          var year = input * 1000; // there is no year 0

          if (year === 0) {
            year = 1;
          }

          return this.year(year);
        } // get the current millenium


        var num = Math.floor(this.year() / 1000);

        if (num >= 0) {
          num += 1;
        }

        return num;
      }
    };
    var _03Year = methods$3$1;

    var methods$4$1 = Object.assign({}, _01Time, _02Date, _03Year); //aliases

    methods$4$1.milliseconds = methods$4$1.millisecond;
    methods$4$1.seconds = methods$4$1.second;
    methods$4$1.minutes = methods$4$1.minute;
    methods$4$1.hours = methods$4$1.hour;
    methods$4$1.hour24 = methods$4$1.hour;
    methods$4$1.h12 = methods$4$1.hour12;
    methods$4$1.h24 = methods$4$1.hour24;
    methods$4$1.days = methods$4$1.day;

    var addMethods$5 = function addMethods(Space) {
      //hook the methods into prototype
      Object.keys(methods$4$1).forEach(function (k) {
        Space.prototype[k] = methods$4$1[k];
      });
    };

    var query = addMethods$5;

    var isLeapYear$2 = fns$1.isLeapYear;

    var getMonthLength$1 = function getMonthLength(month, year) {
      if (month === 1 && isLeapYear$2(year)) {
        return 29;
      }

      return monthLengths_1[month];
    }; //month is the one thing we 'model/compute'
    //- because ms-shifting can be off by enough


    var rollMonth$1 = function rollMonth(want, old) {
      //increment year
      if (want.month > 0) {
        var years = parseInt(want.month / 12, 10);
        want.year = old.year() + years;
        want.month = want.month % 12;
      } else if (want.month < 0) {
        //decrement year
        var _years = Math.floor(Math.abs(want.month) / 13, 10);

        _years = Math.abs(_years) + 1;
        want.year = old.year() - _years; //ignore extras

        want.month = want.month % 12;
        want.month = want.month + 12;

        if (want.month === 12) {
          want.month = 0;
        }
      }

      return want;
    }; // briefly support day=-2 (this does not need to be perfect.)


    var rollDaysDown$1 = function rollDaysDown(want, old, sum) {
      want.year = old.year();
      want.month = old.month();
      var date = old.date();
      want.date = date - Math.abs(sum);

      while (want.date < 1) {
        want.month -= 1;

        if (want.month < 0) {
          want.month = 11;
          want.year -= 1;
        }

        var max = getMonthLength$1(want.month, want.year);
        want.date += max;
      }

      return want;
    }; // briefly support day=33 (this does not need to be perfect.)


    var rollDaysUp$1 = function rollDaysUp(want, old, sum) {
      var year = old.year();
      var month = old.month();
      var max = getMonthLength$1(month, year);

      while (sum > max) {
        sum -= max;
        month += 1;

        if (month >= 12) {
          month -= 12;
          year += 1;
        }

        max = getMonthLength$1(month, year);
      }

      want.month = month;
      want.date = sum;
      return want;
    };

    var _model = {
      months: rollMonth$1,
      days: rollDaysUp$1,
      daysBack: rollDaysDown$1
    };

    // but briefly:
    // millisecond-math, and some post-processing covers most-things
    // we 'model' the calendar here only a little bit
    // and that usually works-out...

    var order$1$1 = ['millisecond', 'second', 'minute', 'hour', 'date', 'month'];
    var keep$1 = {
      second: order$1$1.slice(0, 1),
      minute: order$1$1.slice(0, 2),
      quarterhour: order$1$1.slice(0, 2),
      hour: order$1$1.slice(0, 3),
      date: order$1$1.slice(0, 4),
      month: order$1$1.slice(0, 4),
      quarter: order$1$1.slice(0, 4),
      season: order$1$1.slice(0, 4),
      year: order$1$1,
      decade: order$1$1,
      century: order$1$1
    };
    keep$1.week = keep$1.hour;
    keep$1.season = keep$1.date;
    keep$1.quarter = keep$1.date; // Units need to be dst adjuested

    var dstAwareUnits$1 = {
      year: true,
      quarter: true,
      season: true,
      month: true,
      week: true,
      day: true
    };
    var keepDate$1 = {
      month: true,
      quarter: true,
      season: true,
      year: true
    };

    var addMethods$1$1 = function addMethods(SpaceTime) {
      SpaceTime.prototype.add = function (num, unit) {
        var s = this.clone();

        if (!unit || num === 0) {
          return s; //don't bother
        }

        var old = this.clone();
        unit = fns$1.normalize(unit); //move forward by the estimated milliseconds (rough)

        if (milliseconds$1[unit]) {
          s.epoch += milliseconds$1[unit] * num;
        } else if (unit === 'week') {
          s.epoch += milliseconds$1.day * (num * 7);
        } else if (unit === 'quarter' || unit === 'season') {
          s.epoch += milliseconds$1.month * (num * 4);
        } else if (unit === 'season') {
          s.epoch += milliseconds$1.month * (num * 4);
        } else if (unit === 'quarterhour') {
          s.epoch += milliseconds$1.minute * 15 * num;
        } //now ensure our milliseconds/etc are in-line


        var want = {};

        if (keep$1[unit]) {
          keep$1[unit].forEach(function (u) {
            want[u] = old[u]();
          });
        }

        if (dstAwareUnits$1[unit]) {
          var diff = old.timezone().current.offset - s.timezone().current.offset;
          s.epoch += diff * 3600 * 1000;
        } //ensure month/year has ticked-over


        if (unit === 'month') {
          want.month = old.month() + num; //month is the one unit we 'model' directly

          want = _model.months(want, old);
        } //support coercing a week, too


        if (unit === 'week') {
          var sum = old.date() + num * 7;

          if (sum <= 28 && sum > 1) {
            want.date = sum;
          }
        } //support 25-hour day-changes on dst-changes
        else if (unit === 'date') {
            if (num < 0) {
              want = _model.daysBack(want, old, num);
            } else {
              //specify a naive date number, if it's easy to do...
              var _sum = old.date() + num; // ok, model this one too


              want = _model.days(want, old, _sum);
            } //manually punt it if we haven't moved at all..


            if (num !== 0 && old.isSame(s, 'day')) {
              want.date = old.date() + num;
            }
          } //ensure year has changed (leap-years)
          else if (unit === 'year' && s.year() === old.year()) {
              s.epoch += milliseconds$1.week;
            } //these are easier
            else if (unit === 'decade') {
                want.year = s.year() + 10;
              } else if (unit === 'century') {
                want.year = s.year() + 100;
              } //keep current date, unless the month doesn't have it.


        if (keepDate$1[unit]) {
          var max = monthLengths_1[want.month];
          want.date = old.date();

          if (want.date > max) {
            want.date = max;
          }
        }

        walk_1(s, want);
        return s;
      }; //subtract is only add *-1


      SpaceTime.prototype.subtract = function (num, unit) {
        var s = this.clone();
        return s.add(num * -1, unit);
      }; //add aliases


      SpaceTime.prototype.minus = SpaceTime.prototype.subtract;
      SpaceTime.prototype.plus = SpaceTime.prototype.add;
    };

    var add = addMethods$1$1;

    //make a string, for easy comparison between dates
    var print$1 = {
      millisecond: function millisecond(s) {
        return s.epoch;
      },
      second: function second(s) {
        return [s.year(), s.month(), s.date(), s.hour(), s.minute(), s.second()].join('-');
      },
      minute: function minute(s) {
        return [s.year(), s.month(), s.date(), s.hour(), s.minute()].join('-');
      },
      hour: function hour(s) {
        return [s.year(), s.month(), s.date(), s.hour()].join('-');
      },
      day: function day(s) {
        return [s.year(), s.month(), s.date()].join('-');
      },
      week: function week(s) {
        return [s.year(), s.week()].join('-');
      },
      month: function month(s) {
        return [s.year(), s.month()].join('-');
      },
      quarter: function quarter(s) {
        return [s.year(), s.quarter()].join('-');
      },
      year: function year(s) {
        return s.year();
      }
    };
    print$1.date = print$1.day;

    var addMethods$2$1 = function addMethods(SpaceTime) {
      SpaceTime.prototype.isSame = function (b, unit) {
        var a = this;

        if (!unit) {
          return null;
        }

        if (typeof b === 'string' || typeof b === 'number') {
          b = new SpaceTime(b, this.timezone.name);
        } //support 'seconds' aswell as 'second'


        unit = unit.replace(/s$/, '');

        if (print$1[unit]) {
          return print$1[unit](a) === print$1[unit](b);
        }

        return null;
      };
    };

    var same = addMethods$2$1;

    var addMethods$3$1 = function addMethods(SpaceTime) {
      var methods = {
        isAfter: function isAfter(d) {
          d = fns$1.beADate(d, this);
          var epoch = fns$1.getEpoch(d);

          if (epoch === null) {
            return null;
          }

          return this.epoch > epoch;
        },
        isBefore: function isBefore(d) {
          d = fns$1.beADate(d, this);
          var epoch = fns$1.getEpoch(d);

          if (epoch === null) {
            return null;
          }

          return this.epoch < epoch;
        },
        isEqual: function isEqual(d) {
          d = fns$1.beADate(d, this);
          var epoch = fns$1.getEpoch(d);

          if (epoch === null) {
            return null;
          }

          return this.epoch === epoch;
        },
        isBetween: function isBetween(start, end) {
          var isInclusive = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;
          start = fns$1.beADate(start, this);
          end = fns$1.beADate(end, this);
          var startEpoch = fns$1.getEpoch(start);

          if (startEpoch === null) {
            return null;
          }

          var endEpoch = fns$1.getEpoch(end);

          if (endEpoch === null) {
            return null;
          }

          if (isInclusive) {
            return this.isBetween(start, end) || this.isEqual(start) || this.isEqual(end);
          }

          return startEpoch < this.epoch && this.epoch < endEpoch;
        }
      }; //hook them into proto

      Object.keys(methods).forEach(function (k) {
        SpaceTime.prototype[k] = methods[k];
      });
    };

    var compare = addMethods$3$1;

    var addMethods$4$1 = function addMethods(SpaceTime) {
      var methods = {
        i18n: function i18n(data) {
          //change the day names
          if (fns$1.isObject(data.days)) {
            days$1.set(data.days);
          } //change the month names


          if (fns$1.isObject(data.months)) {
            months$2.set(data.months);
          }
        }
      }; //hook them into proto

      Object.keys(methods).forEach(function (k) {
        SpaceTime.prototype[k] = methods[k];
      });
    };

    var i18n = addMethods$4$1;

    var timezones$1 = unpack; //fake timezone-support, for fakers (es5 class)

    var SpaceTime$1 = function SpaceTime(input$1, tz) {
      var options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
      //the holy moment
      this.epoch = null; //the shift for the given timezone

      this.tz = find(tz, timezones$1); //whether to output warnings to console

      this.silent = options.silent || true; // favour british interpretation of 02/02/2018, etc

      this.british = options.dmy || options.british; //does the week start on sunday, or monday:

      this._weekStart = 1; //default to monday

      if (options.weekStart !== undefined) {
        this._weekStart = options.weekStart;
      } // the reference today date object, (for testing)


      this._today = {};

      if (options.today !== undefined) {
        this._today = options.today;
      } //add getter/setters


      Object.defineProperty(this, 'd', {
        //return a js date object
        get: function get() {
          var offset = quick(this); //every computer is somewhere- get this computer's built-in offset

          var bias = new Date(this.epoch).getTimezoneOffset() || 0; //movement

          var shift = bias + offset * 60; //in minutes

          shift = shift * 60 * 1000; //in ms
          //remove this computer's offset

          var epoch = this.epoch + shift;
          var d = new Date(epoch);
          return d;
        }
      }); //add this data on the object, to allow adding new timezones

      Object.defineProperty(this, 'timezones', {
        get: function get() {
          return timezones$1;
        },
        set: function set(obj) {
          timezones$1 = obj;
          return obj;
        }
      }); //parse the various formats

      var tmp = input(this, input$1, tz);
      this.epoch = tmp.epoch;
    }; //(add instance methods to prototype)


    Object.keys(methods_1).forEach(function (k) {
      SpaceTime$1.prototype[k] = methods_1[k];
    }); // ¯\_(ツ)_/¯

    SpaceTime$1.prototype.clone = function () {
      return new SpaceTime$1(this.epoch, this.tz, {
        silent: this.silent,
        weekStart: this._weekStart,
        today: this._today
      });
    }; //return native date object at the same epoch


    SpaceTime$1.prototype.toLocalDate = function () {
      return new Date(this.epoch);
    }; //append more methods


    query(SpaceTime$1);
    add(SpaceTime$1);
    same(SpaceTime$1);
    compare(SpaceTime$1);
    i18n(SpaceTime$1);
    var spacetime = SpaceTime$1;

    var whereIts$1 = function whereIts(a, b) {
      var start = new spacetime(null);
      var end = new spacetime(null);
      start = start.time(a); //if b is undefined, use as 'within one hour'

      if (b) {
        end = end.time(b);
      } else {
        end = start.add(59, 'minutes');
      }

      var startHour = start.hour();
      var endHour = end.hour();
      var tzs = Object.keys(start.timezones).filter(function (tz) {
        if (tz.indexOf('/') === -1) {
          return false;
        }

        var m = new spacetime(null, tz);
        var hour = m.hour(); //do 'calendar-compare' not real-time-compare

        if (hour >= startHour && hour <= endHour) {
          //test minutes too, if applicable
          if (hour === startHour && m.minute() < start.minute()) {
            return false;
          }

          if (hour === endHour && m.minute() > end.minute()) {
            return false;
          }

          return true;
        }

        return false;
      });
      return tzs;
    };

    var whereIts_1 = whereIts$1;

    var _version = '6.6.3';

    var main$1$1 = function main(input, tz, options) {
      return new spacetime(input, tz, options);
    }; // set all properties of a given 'today' object


    var setToday$1 = function setToday(s) {
      var today = s._today || {};
      Object.keys(today).forEach(function (k) {
        s = s[k](today[k]);
      });
      return s;
    }; //some helper functions on the main method


    main$1$1.now = function (tz, options) {
      var s = new spacetime(new Date().getTime(), tz, options);
      s = setToday$1(s);
      return s;
    };

    main$1$1.today = function (tz, options) {
      var s = new spacetime(new Date().getTime(), tz, options);
      s = setToday$1(s);
      return s.startOf('day');
    };

    main$1$1.tomorrow = function (tz, options) {
      var s = new spacetime(new Date().getTime(), tz, options);
      s = setToday$1(s);
      return s.add(1, 'day').startOf('day');
    };

    main$1$1.yesterday = function (tz, options) {
      var s = new spacetime(new Date().getTime(), tz, options);
      s = setToday$1(s);
      return s.subtract(1, 'day').startOf('day');
    };

    main$1$1.extend = function (obj) {
      Object.keys(obj).forEach(function (k) {
        spacetime.prototype[k] = obj[k];
      });
      return this;
    }; //find tz by time


    main$1$1.whereIts = whereIts_1;
    main$1$1.version = _version; //aliases:

    main$1$1.plugin = main$1$1.extend;
    var src = main$1$1;

    var colors = {
      blue: '#6699cc',
      green: '#6accb2',
      yellow: '#e1e6b3',
      red: '#cc7066',
      pink: '#F2C0BB', //'#e6b8b3',

      brown: '#705E5C',
      orange: '#cc8a66',
      purple: '#d8b3e6',
      navy: '#335799',
      olive: '#7f9c6c',

      fuscia: '#735873', //'#603960',
      beige: '#e6d7b3',
      slate: '#8C8C88',
      suede: '#9c896c',
      burnt: '#603a39',

      sea: '#50617A',
      sky: '#2D85A8',
      night: '#303b50',
      // dark: '#2C3133',
      rouge: '#914045',
      grey: '#838B91',

      mud: '#C4ABAB',
      royal: '#275291',
      cherry: '#cc6966',
      tulip: '#e6b3bc',
      rose: '#D68881',
      fire: '#AB5850',

      greyblue: '#72697D',
      greygreen: '#8BA3A2',
      greypurple: '#978BA3',
      burn: '#6D5685',

      slategrey: '#bfb0b3',
      light: '#a3a5a5',
      lighter: '#d7d5d2',
      fudge: '#4d4d4d',
      lightgrey: '#949a9e',

      white: '#fbfbfb',
      dimgrey: '#606c74',
      softblack: '#463D4F',
      dark: '#443d3d',
      black: '#333333',
    };

    //a very-tiny version of d3-scale's scaleLinear
    const scaleLinear = function (obj, num) {
      let world = obj.world || [];
      let minmax = obj.minmax || [];
      let range = minmax[1] - minmax[0];
      let percent = (num - minmax[0]) / range;
      let size = world[1] - world[0];
      return parseInt(size * percent, 10)
    };

    /* Users/spencer/mountain/somehow-timeline/src/Timeline.svelte generated by Svelte v3.29.0 */
    const file$3 = "Users/spencer/mountain/somehow-timeline/src/Timeline.svelte";

    function add_css$3() {
    	var style = element$1("style");
    	style.id = "svelte-jp6m1m-style";
    	style.textContent = ".part{min-height:100%}.timeline.svelte-jp6m1m{position:relative;display:flex;flex-direction:row;justify-content:space-around;text-align:center;flex-wrap:nowrap;align-self:stretch;margin:1rem}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVGltZWxpbmUuc3ZlbHRlIiwic291cmNlcyI6WyJUaW1lbGluZS5zdmVsdGUiXSwic291cmNlc0NvbnRlbnQiOlsiPHNjcmlwdD5cbiAgaW1wb3J0IHsgc2V0Q29udGV4dCB9IGZyb20gJ3N2ZWx0ZSdcbiAgaW1wb3J0IHsgd3JpdGFibGUgfSBmcm9tICdzdmVsdGUvc3RvcmUnXG5cbiAgaW1wb3J0IHsgYWZ0ZXJVcGRhdGUgfSBmcm9tICdzdmVsdGUnXG4gIGltcG9ydCBzcGFjZXRpbWUgZnJvbSAnc3BhY2V0aW1lJ1xuICBpbXBvcnQgY29sb3JzIGZyb20gJy4vX2xpYi9jb2xvcnMnXG4gIGltcG9ydCBsaW5lYXIgZnJvbSAnLi9fbGliL3NjYWxlJ1xuICBleHBvcnQgbGV0IHN0YXJ0ID0gbnVsbFxuICBleHBvcnQgbGV0IGVuZCA9IG51bGxcbiAgZXhwb3J0IGxldCBoZWlnaHQgPSA4MDBcbiAgc3RhcnQgPSBzcGFjZXRpbWUoc3RhcnQpXG4gIGVuZCA9IHNwYWNldGltZShlbmQpXG5cbiAgbGV0IGggPSB3cml0YWJsZShoZWlnaHQpXG4gIGxldCBzID0gd3JpdGFibGUoc3RhcnQpXG4gIGxldCBlID0gd3JpdGFibGUoZW5kKVxuICBzZXRDb250ZXh0KCdoZWlnaHQnLCBoKVxuICBzZXRDb250ZXh0KCdzdGFydCcsIHMpXG4gIHNldENvbnRleHQoJ2VuZCcsIGUpXG4gIHNldENvbnRleHQoJ2NvbG9ycycsIGNvbG9ycylcblxuICBsZXQgbXlTY2FsZSA9IChlcG9jaCkgPT4ge1xuICAgIHJldHVybiBsaW5lYXIoXG4gICAgICB7XG4gICAgICAgIHdvcmxkOiBbMCwgJGhdLFxuICAgICAgICBtaW5tYXg6IFskcy5lcG9jaCwgJGUuZXBvY2hdLFxuICAgICAgfSxcbiAgICAgIGVwb2NoXG4gICAgKVxuICB9XG4gIHNldENvbnRleHQoJ3NjYWxlJywgbXlTY2FsZSlcblxuICBhZnRlclVwZGF0ZSgoKSA9PiB7XG4gICAgJGggPSBoZWlnaHRcbiAgICAkcyA9IHNwYWNldGltZShzdGFydClcbiAgICAkZSA9IHNwYWNldGltZShlbmQpXG4gICAgc2V0Q29udGV4dCgnaGVpZ2h0JywgaGVpZ2h0KVxuICAgIHNldENvbnRleHQoJ3N0YXJ0Jywgc3BhY2V0aW1lKHN0YXJ0KSlcbiAgICBzZXRDb250ZXh0KCdlbmQnLCBzcGFjZXRpbWUoZW5kKSlcbiAgfSlcbjwvc2NyaXB0PlxuXG48ZGl2IGNsYXNzPVwidGltZWxpbmVcIiBzdHlsZT1cImhlaWdodDp7JGh9cHhcIj5cbiAgPHNsb3QgLz5cbjwvZGl2PlxuXG48c3R5bGU+XG4gIDpnbG9iYWwoLnBhcnQpIHtcbiAgICBtaW4taGVpZ2h0OiAxMDAlO1xuICB9XG5cbiAgLnRpbWVsaW5lIHtcbiAgICBwb3NpdGlvbjogcmVsYXRpdmU7XG4gICAgZGlzcGxheTogZmxleDtcbiAgICBmbGV4LWRpcmVjdGlvbjogcm93O1xuICAgIGp1c3RpZnktY29udGVudDogc3BhY2UtYXJvdW5kO1xuICAgIHRleHQtYWxpZ246IGNlbnRlcjtcbiAgICBmbGV4LXdyYXA6IG5vd3JhcDtcbiAgICBhbGlnbi1zZWxmOiBzdHJldGNoO1xuICAgIG1hcmdpbjogMXJlbTtcbiAgICAvKiBib3JkZXI6IDFweCBzb2xpZCBncmV5OyAqL1xuICB9XG48L3N0eWxlPlxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQWdEVSxLQUFLLEFBQUUsQ0FBQyxBQUNkLFVBQVUsQ0FBRSxJQUFJLEFBQ2xCLENBQUMsQUFFRCxTQUFTLGNBQUMsQ0FBQyxBQUNULFFBQVEsQ0FBRSxRQUFRLENBQ2xCLE9BQU8sQ0FBRSxJQUFJLENBQ2IsY0FBYyxDQUFFLEdBQUcsQ0FDbkIsZUFBZSxDQUFFLFlBQVksQ0FDN0IsVUFBVSxDQUFFLE1BQU0sQ0FDbEIsU0FBUyxDQUFFLE1BQU0sQ0FDakIsVUFBVSxDQUFFLE9BQU8sQ0FDbkIsTUFBTSxDQUFFLElBQUksQUFFZCxDQUFDIn0= */";
    	append_dev$1(document.head, style);
    }

    function create_fragment$3(ctx) {
    	let div;
    	let current;
    	const default_slot_template = /*#slots*/ ctx[8].default;
    	const default_slot = create_slot$1(default_slot_template, ctx, /*$$scope*/ ctx[7], null);

    	const block = {
    		c: function create() {
    			div = element$1("div");
    			if (default_slot) default_slot.c();
    			attr_dev$1(div, "class", "timeline svelte-jp6m1m");
    			set_style$1(div, "height", /*$h*/ ctx[0] + "px");
    			add_location$1(div, file$3, 43, 0, 946);
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
    				if (default_slot.p && dirty & /*$$scope*/ 128) {
    					update_slot$1(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[7], dirty, null, null);
    				}
    			}

    			if (!current || dirty & /*$h*/ 1) {
    				set_style$1(div, "height", /*$h*/ ctx[0] + "px");
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
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let $h;
    	let $s;
    	let $e;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots$1("Timeline", slots, ['default']);
    	let { start = null } = $$props;
    	let { end = null } = $$props;
    	let { height = 800 } = $$props;
    	start = src(start);
    	end = src(end);
    	let h = writable(height);
    	validate_store(h, "h");
    	component_subscribe($$self, h, value => $$invalidate(0, $h = value));
    	let s = writable(start);
    	validate_store(s, "s");
    	component_subscribe($$self, s, value => $$invalidate(9, $s = value));
    	let e = writable(end);
    	validate_store(e, "e");
    	component_subscribe($$self, e, value => $$invalidate(10, $e = value));
    	setContext("height", h);
    	setContext("start", s);
    	setContext("end", e);
    	setContext("colors", colors);

    	let myScale = epoch => {
    		return scaleLinear(
    			{
    				world: [0, $h],
    				minmax: [$s.epoch, $e.epoch]
    			},
    			epoch
    		);
    	};

    	setContext("scale", myScale);

    	afterUpdate(() => {
    		set_store_value(h, $h = height, $h);
    		set_store_value(s, $s = src(start), $s);
    		set_store_value(e, $e = src(end), $e);
    		setContext("height", height);
    		setContext("start", src(start));
    		setContext("end", src(end));
    	});

    	const writable_props = ["start", "end", "height"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Timeline> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("start" in $$props) $$invalidate(4, start = $$props.start);
    		if ("end" in $$props) $$invalidate(5, end = $$props.end);
    		if ("height" in $$props) $$invalidate(6, height = $$props.height);
    		if ("$$scope" in $$props) $$invalidate(7, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		setContext,
    		writable,
    		afterUpdate,
    		spacetime: src,
    		colors,
    		linear: scaleLinear,
    		start,
    		end,
    		height,
    		h,
    		s,
    		e,
    		myScale,
    		$h,
    		$s,
    		$e
    	});

    	$$self.$inject_state = $$props => {
    		if ("start" in $$props) $$invalidate(4, start = $$props.start);
    		if ("end" in $$props) $$invalidate(5, end = $$props.end);
    		if ("height" in $$props) $$invalidate(6, height = $$props.height);
    		if ("h" in $$props) $$invalidate(1, h = $$props.h);
    		if ("s" in $$props) $$invalidate(2, s = $$props.s);
    		if ("e" in $$props) $$invalidate(3, e = $$props.e);
    		if ("myScale" in $$props) myScale = $$props.myScale;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [$h, h, s, e, start, end, height, $$scope, slots];
    }

    class Timeline extends SvelteComponentDev$1 {
    	constructor(options) {
    		super(options);
    		if (!document.getElementById("svelte-jp6m1m-style")) add_css$3();
    		init$1(this, options, instance$3, create_fragment$3, safe_not_equal$1, { start: 4, end: 5, height: 6 });

    		dispatch_dev$1("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Timeline",
    			options,
    			id: create_fragment$3.name
    		});
    	}

    	get start() {
    		throw new Error("<Timeline>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set start(value) {
    		throw new Error("<Timeline>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get end() {
    		throw new Error("<Timeline>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set end(value) {
    		throw new Error("<Timeline>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get height() {
    		throw new Error("<Timeline>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set height(value) {
    		throw new Error("<Timeline>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* Users/spencer/mountain/somehow-timeline/src/shapes/Ticks.svelte generated by Svelte v3.29.0 */
    const file$4 = "Users/spencer/mountain/somehow-timeline/src/shapes/Ticks.svelte";

    function add_css$4() {
    	var style = element$1("style");
    	style.id = "svelte-1e7wl3m-style";
    	style.textContent = ".container.svelte-1e7wl3m{position:relative;min-width:40px}.label.svelte-1e7wl3m{position:absolute;padding-left:4px;padding-right:4px;white-space:nowrap;text-align:left;font-size:1.1rem;height:1.2rem;opacity:0.6;transform:translate(0px, -8px)}.underline.svelte-1e7wl3m{opacity:1;border-bottom:1px solid grey}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVGlja3Muc3ZlbHRlIiwic291cmNlcyI6WyJUaWNrcy5zdmVsdGUiXSwic291cmNlc0NvbnRlbnQiOlsiPHNjcmlwdD5cbiAgaW1wb3J0IHNwYWNldGltZSBmcm9tICdzcGFjZXRpbWUnXG4gIGltcG9ydCB7IGdldENvbnRleHQgfSBmcm9tICdzdmVsdGUnXG4gIGltcG9ydCBjb2xvcnMgZnJvbSAnLi4vX2xpYi9jb2xvcnMuanMnXG4gIGV4cG9ydCBsZXQgZm9ybWF0ID0gJydcbiAgZXhwb3J0IGxldCBldmVyeSA9ICdtb250aCdcbiAgZXhwb3J0IGxldCBzaXplID0gJzEycHgnXG4gIGV4cG9ydCBsZXQgdW5kZXJsaW5lID0gZmFsc2VcbiAgZXhwb3J0IGxldCBjb2xvciA9ICdncmV5J1xuICBleHBvcnQgbGV0IG9wYWNpdHkgPSAnMSdcbiAgY29sb3IgPSBjb2xvcnNbY29sb3JdIHx8IGNvbG9yXG5cbiAgY29uc3QgZm9ybWF0cyA9IHtcbiAgICBob3VyOiAne2hvdXJ9e2FtcG19JyxcbiAgICBkYXk6ICd7bW9udGgtc2hvcnR9IHtkYXRlfScsXG4gICAgd2VlazogJ3ttb250aC1zaG9ydH0ge2RhdGV9JyxcbiAgICBtb250aDogJ3ttb250aC1zaG9ydH0nLFxuICAgIHllYXI6ICd5ZWFyJyxcbiAgICBxdWFydGVyOiAne3F1YXJ0ZXJ9JyxcbiAgICBkZWNhZGU6ICd5ZWFyJyxcbiAgICBjZW50dXJ5OiAneWVhcicsXG4gIH1cbiAgZm9ybWF0ID0gZm9ybWF0IHx8IGZvcm1hdHNbZXZlcnldIHx8ICd7bW9udGgtc2hvcnR9IHtkYXRlfSdcblxuICBsZXQgc3RhcnQgPSBnZXRDb250ZXh0KCdzdGFydCcpXG4gIGNvbnN0IGVuZCA9IGdldENvbnRleHQoJ2VuZCcpXG5cbiAgY29uc3Qgc2NhbGUgPSBnZXRDb250ZXh0KCdzY2FsZScpXG5cbiAgY29uc3QgZG9VbmRlcmxpbmUgPSB7XG4gICAgaG91cjogLzEyOjAwLyxcbiAgICB5ZWFyOiAvMDAkLyxcbiAgICBkZWNhZGU6IC8wMCQvLFxuICB9XG5cbiAgJHN0YXJ0ID0gJHN0YXJ0Lm1pbnVzKDEsICdzZWNvbmQnKVxuICBsZXQgYXJyID0gJHN0YXJ0LmV2ZXJ5KGV2ZXJ5LCBlbmQpXG4gIGxldCB0aWNrcyA9IGFyci5tYXAoKHMpID0+IHtcbiAgICBsZXQgeSA9IHNjYWxlKHMuZXBvY2gpXG4gICAgbGV0IGxhYmVsID0gcy5mb3JtYXQoZm9ybWF0KVxuICAgIHJldHVybiB7XG4gICAgICB2YWx1ZTogeSxcbiAgICAgIHVuZGVybGluZTogZG9VbmRlcmxpbmVbZXZlcnldICYmIGRvVW5kZXJsaW5lW2V2ZXJ5XS50ZXN0KGxhYmVsKSxcbiAgICAgIGxhYmVsOiBsYWJlbCxcbiAgICB9XG4gIH0pXG48L3NjcmlwdD5cblxuPGRpdiBjbGFzcz1cImNvbnRhaW5lclwiIHN0eWxlPVwib3BhY2l0eTp7b3BhY2l0eX07XCI+XG4gIHsjZWFjaCB0aWNrcyBhcyB0aWNrfVxuICAgIDxkaXZcbiAgICAgIGNsYXNzPVwibGFiZWxcIlxuICAgICAgY2xhc3M6dW5kZXJsaW5lPXt1bmRlcmxpbmUgfHwgdGljay51bmRlcmxpbmV9XG4gICAgICBzdHlsZT1cInRvcDp7dGljay52YWx1ZX1weDsgY29sb3I6e2NvbG9yfTsgZm9udC1zaXplOntzaXplfTtcIlxuICAgID5cbiAgICAgIHt0aWNrLmxhYmVsfVxuICAgIDwvZGl2PlxuICB7L2VhY2h9XG48L2Rpdj5cblxuPHN0eWxlPlxuICAuY29udGFpbmVyIHtcbiAgICBwb3NpdGlvbjogcmVsYXRpdmU7XG4gICAgbWluLXdpZHRoOiA0MHB4O1xuICB9XG4gIC5sYWJlbCB7XG4gICAgcG9zaXRpb246IGFic29sdXRlO1xuICAgIHBhZGRpbmctbGVmdDogNHB4O1xuICAgIHBhZGRpbmctcmlnaHQ6IDRweDtcbiAgICB3aGl0ZS1zcGFjZTogbm93cmFwO1xuICAgIHRleHQtYWxpZ246IGxlZnQ7XG4gICAgZm9udC1zaXplOiAxLjFyZW07XG4gICAgaGVpZ2h0OiAxLjJyZW07XG4gICAgb3BhY2l0eTogMC42O1xuICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlKDBweCwgLThweCk7XG4gIH1cbiAgLnVuZGVybGluZSB7XG4gICAgb3BhY2l0eTogMTtcbiAgICBib3JkZXItYm90dG9tOiAxcHggc29saWQgZ3JleTtcbiAgfVxuPC9zdHlsZT5cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUE2REUsVUFBVSxlQUFDLENBQUMsQUFDVixRQUFRLENBQUUsUUFBUSxDQUNsQixTQUFTLENBQUUsSUFBSSxBQUNqQixDQUFDLEFBQ0QsTUFBTSxlQUFDLENBQUMsQUFDTixRQUFRLENBQUUsUUFBUSxDQUNsQixZQUFZLENBQUUsR0FBRyxDQUNqQixhQUFhLENBQUUsR0FBRyxDQUNsQixXQUFXLENBQUUsTUFBTSxDQUNuQixVQUFVLENBQUUsSUFBSSxDQUNoQixTQUFTLENBQUUsTUFBTSxDQUNqQixNQUFNLENBQUUsTUFBTSxDQUNkLE9BQU8sQ0FBRSxHQUFHLENBQ1osU0FBUyxDQUFFLFVBQVUsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEFBQ2pDLENBQUMsQUFDRCxVQUFVLGVBQUMsQ0FBQyxBQUNWLE9BQU8sQ0FBRSxDQUFDLENBQ1YsYUFBYSxDQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxBQUMvQixDQUFDIn0= */";
    	append_dev$1(document.head, style);
    }

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[14] = list[i];
    	return child_ctx;
    }

    // (50:2) {#each ticks as tick}
    function create_each_block(ctx) {
    	let div;
    	let t0_value = /*tick*/ ctx[14].label + "";
    	let t0;
    	let t1;

    	const block = {
    		c: function create() {
    			div = element$1("div");
    			t0 = text$1(t0_value);
    			t1 = space$1();
    			attr_dev$1(div, "class", "label svelte-1e7wl3m");
    			set_style$1(div, "top", /*tick*/ ctx[14].value + "px");
    			set_style$1(div, "color", /*color*/ ctx[0]);
    			set_style$1(div, "font-size", /*size*/ ctx[1]);
    			toggle_class$1(div, "underline", /*underline*/ ctx[2] || /*tick*/ ctx[14].underline);
    			add_location$1(div, file$4, 50, 4, 1192);
    		},
    		m: function mount(target, anchor) {
    			insert_dev$1(target, div, anchor);
    			append_dev$1(div, t0);
    			append_dev$1(div, t1);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*color*/ 1) {
    				set_style$1(div, "color", /*color*/ ctx[0]);
    			}

    			if (dirty & /*size*/ 2) {
    				set_style$1(div, "font-size", /*size*/ ctx[1]);
    			}

    			if (dirty & /*underline, ticks*/ 36) {
    				toggle_class$1(div, "underline", /*underline*/ ctx[2] || /*tick*/ ctx[14].underline);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev$1(div);
    		}
    	};

    	dispatch_dev$1("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(50:2) {#each ticks as tick}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$4(ctx) {
    	let div;
    	let each_value = /*ticks*/ ctx[5];
    	validate_each_argument$1(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			div = element$1("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev$1(div, "class", "container svelte-1e7wl3m");
    			set_style$1(div, "opacity", /*opacity*/ ctx[3]);
    			add_location$1(div, file$4, 48, 0, 1113);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev$1(target, div, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div, null);
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*ticks, color, size, underline*/ 39) {
    				each_value = /*ticks*/ ctx[5];
    				validate_each_argument$1(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if (dirty & /*opacity*/ 8) {
    				set_style$1(div, "opacity", /*opacity*/ ctx[3]);
    			}
    		},
    		i: noop$1,
    		o: noop$1,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev$1(div);
    			destroy_each$1(each_blocks, detaching);
    		}
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
    	let $start;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots$1("Ticks", slots, []);
    	let { format = "" } = $$props;
    	let { every = "month" } = $$props;
    	let { size = "12px" } = $$props;
    	let { underline = false } = $$props;
    	let { color = "grey" } = $$props;
    	let { opacity = "1" } = $$props;
    	color = colors[color] || color;

    	const formats = {
    		hour: "{hour}{ampm}",
    		day: "{month-short} {date}",
    		week: "{month-short} {date}",
    		month: "{month-short}",
    		year: "year",
    		quarter: "{quarter}",
    		decade: "year",
    		century: "year"
    	};

    	format = format || formats[every] || "{month-short} {date}";
    	let start = getContext("start");
    	validate_store(start, "start");
    	component_subscribe($$self, start, value => $$invalidate(8, $start = value));
    	const end = getContext("end");
    	const scale = getContext("scale");

    	const doUnderline = {
    		hour: /12:00/,
    		year: /00$/,
    		decade: /00$/
    	};

    	set_store_value(start, $start = $start.minus(1, "second"), $start);
    	let arr = $start.every(every, end);

    	let ticks = arr.map(s => {
    		let y = scale(s.epoch);
    		let label = s.format(format);

    		return {
    			value: y,
    			underline: doUnderline[every] && doUnderline[every].test(label),
    			label
    		};
    	});

    	const writable_props = ["format", "every", "size", "underline", "color", "opacity"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Ticks> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("format" in $$props) $$invalidate(6, format = $$props.format);
    		if ("every" in $$props) $$invalidate(7, every = $$props.every);
    		if ("size" in $$props) $$invalidate(1, size = $$props.size);
    		if ("underline" in $$props) $$invalidate(2, underline = $$props.underline);
    		if ("color" in $$props) $$invalidate(0, color = $$props.color);
    		if ("opacity" in $$props) $$invalidate(3, opacity = $$props.opacity);
    	};

    	$$self.$capture_state = () => ({
    		spacetime: src,
    		getContext,
    		colors,
    		format,
    		every,
    		size,
    		underline,
    		color,
    		opacity,
    		formats,
    		start,
    		end,
    		scale,
    		doUnderline,
    		arr,
    		ticks,
    		$start
    	});

    	$$self.$inject_state = $$props => {
    		if ("format" in $$props) $$invalidate(6, format = $$props.format);
    		if ("every" in $$props) $$invalidate(7, every = $$props.every);
    		if ("size" in $$props) $$invalidate(1, size = $$props.size);
    		if ("underline" in $$props) $$invalidate(2, underline = $$props.underline);
    		if ("color" in $$props) $$invalidate(0, color = $$props.color);
    		if ("opacity" in $$props) $$invalidate(3, opacity = $$props.opacity);
    		if ("start" in $$props) $$invalidate(4, start = $$props.start);
    		if ("arr" in $$props) arr = $$props.arr;
    		if ("ticks" in $$props) $$invalidate(5, ticks = $$props.ticks);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [color, size, underline, opacity, start, ticks, format, every];
    }

    class Ticks extends SvelteComponentDev$1 {
    	constructor(options) {
    		super(options);
    		if (!document.getElementById("svelte-1e7wl3m-style")) add_css$4();

    		init$1(this, options, instance$4, create_fragment$4, safe_not_equal$1, {
    			format: 6,
    			every: 7,
    			size: 1,
    			underline: 2,
    			color: 0,
    			opacity: 3
    		});

    		dispatch_dev$1("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Ticks",
    			options,
    			id: create_fragment$4.name
    		});
    	}

    	get format() {
    		throw new Error("<Ticks>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set format(value) {
    		throw new Error("<Ticks>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get every() {
    		throw new Error("<Ticks>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set every(value) {
    		throw new Error("<Ticks>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get size() {
    		throw new Error("<Ticks>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set size(value) {
    		throw new Error("<Ticks>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get underline() {
    		throw new Error("<Ticks>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set underline(value) {
    		throw new Error("<Ticks>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get color() {
    		throw new Error("<Ticks>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set color(value) {
    		throw new Error("<Ticks>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get opacity() {
    		throw new Error("<Ticks>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set opacity(value) {
    		throw new Error("<Ticks>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* Users/spencer/mountain/somehow-timeline/src/shapes/Column.svelte generated by Svelte v3.29.0 */
    const file$5 = "Users/spencer/mountain/somehow-timeline/src/shapes/Column.svelte";

    function add_css$5() {
    	var style = element$1("style");
    	style.id = "svelte-1sl59b1-style";
    	style.textContent = ".column.svelte-1sl59b1{flex:1;position:relative}.label.svelte-1sl59b1{color:grey;font-size:12px;background-color:#fbfbfb;display:block;z-index:4;text-align:center}@media only screen and (max-width: 600px){.column.svelte-1sl59b1{margin:0px 5px !important}.label.svelte-1sl59b1{font-size:11px}}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ29sdW1uLnN2ZWx0ZSIsInNvdXJjZXMiOlsiQ29sdW1uLnN2ZWx0ZSJdLCJzb3VyY2VzQ29udGVudCI6WyI8c2NyaXB0PlxuICBpbXBvcnQgY29sb3JzIGZyb20gJy4uL19saWIvY29sb3JzLmpzJ1xuICBleHBvcnQgbGV0IGxhYmVsID0gJydcbiAgZXhwb3J0IGxldCB3aWR0aCA9ICcnXG4gIGV4cG9ydCBsZXQgY29sb3IgPSAnc3RlZWxibHVlJ1xuICBjb2xvciA9IGNvbG9yc1tjb2xvcl0gfHwgY29sb3JcbiAgZXhwb3J0IGxldCB0aXRsZSA9ICcnXG4gIGV4cG9ydCBsZXQgbWFyZ2luID0gJzIwcHgnXG4gIGxhYmVsID0gbGFiZWwgfHwgdGl0bGVcbjwvc2NyaXB0PlxuXG48ZGl2IGNsYXNzPVwicGFydCBjb2x1bW5cIiBzdHlsZT1cIm1hcmdpbjowcHgge21hcmdpbn0gMHB4IHttYXJnaW59OyBtYXgtd2lkdGg6e3dpZHRofTsgbWluLXdpZHRoOnt3aWR0aH07XCI+XG4gIDxkaXYgY2xhc3M9XCJsYWJlbFwiIHN0eWxlPVwiY29sb3I6e2NvbG9yfTtcIj57bGFiZWx9PC9kaXY+XG4gIDxzbG90IC8+XG48L2Rpdj5cblxuPHN0eWxlPlxuICAuY29sdW1uIHtcbiAgICBmbGV4OiAxO1xuICAgIHBvc2l0aW9uOiByZWxhdGl2ZTtcbiAgfVxuICAubGFiZWwge1xuICAgIGNvbG9yOiBncmV5O1xuICAgIGZvbnQtc2l6ZTogMTJweDtcbiAgICBiYWNrZ3JvdW5kLWNvbG9yOiAjZmJmYmZiO1xuICAgIGRpc3BsYXk6IGJsb2NrO1xuICAgIHotaW5kZXg6IDQ7XG4gICAgdGV4dC1hbGlnbjogY2VudGVyO1xuICB9XG4gIEBtZWRpYSBvbmx5IHNjcmVlbiBhbmQgKG1heC13aWR0aDogNjAwcHgpIHtcbiAgICAuY29sdW1uIHtcbiAgICAgIG1hcmdpbjogMHB4IDVweCAhaW1wb3J0YW50O1xuICAgIH1cbiAgICAubGFiZWwge1xuICAgICAgZm9udC1zaXplOiAxMXB4O1xuICAgIH1cbiAgfVxuPC9zdHlsZT5cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFpQkUsT0FBTyxlQUFDLENBQUMsQUFDUCxJQUFJLENBQUUsQ0FBQyxDQUNQLFFBQVEsQ0FBRSxRQUFRLEFBQ3BCLENBQUMsQUFDRCxNQUFNLGVBQUMsQ0FBQyxBQUNOLEtBQUssQ0FBRSxJQUFJLENBQ1gsU0FBUyxDQUFFLElBQUksQ0FDZixnQkFBZ0IsQ0FBRSxPQUFPLENBQ3pCLE9BQU8sQ0FBRSxLQUFLLENBQ2QsT0FBTyxDQUFFLENBQUMsQ0FDVixVQUFVLENBQUUsTUFBTSxBQUNwQixDQUFDLEFBQ0QsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxZQUFZLEtBQUssQ0FBQyxBQUFDLENBQUMsQUFDekMsT0FBTyxlQUFDLENBQUMsQUFDUCxNQUFNLENBQUUsR0FBRyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEFBQzVCLENBQUMsQUFDRCxNQUFNLGVBQUMsQ0FBQyxBQUNOLFNBQVMsQ0FBRSxJQUFJLEFBQ2pCLENBQUMsQUFDSCxDQUFDIn0= */";
    	append_dev$1(document.head, style);
    }

    function create_fragment$5(ctx) {
    	let div1;
    	let div0;
    	let t0;
    	let t1;
    	let current;
    	const default_slot_template = /*#slots*/ ctx[6].default;
    	const default_slot = create_slot$1(default_slot_template, ctx, /*$$scope*/ ctx[5], null);

    	const block = {
    		c: function create() {
    			div1 = element$1("div");
    			div0 = element$1("div");
    			t0 = text$1(/*label*/ ctx[0]);
    			t1 = space$1();
    			if (default_slot) default_slot.c();
    			attr_dev$1(div0, "class", "label svelte-1sl59b1");
    			set_style$1(div0, "color", /*color*/ ctx[1]);
    			add_location$1(div0, file$5, 12, 2, 361);
    			attr_dev$1(div1, "class", "part column svelte-1sl59b1");
    			set_style$1(div1, "margin", "0px " + /*margin*/ ctx[3] + " 0px " + /*margin*/ ctx[3]);
    			set_style$1(div1, "max-width", /*width*/ ctx[2]);
    			set_style$1(div1, "min-width", /*width*/ ctx[2]);
    			add_location$1(div1, file$5, 11, 0, 253);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev$1(target, div1, anchor);
    			append_dev$1(div1, div0);
    			append_dev$1(div0, t0);
    			append_dev$1(div1, t1);

    			if (default_slot) {
    				default_slot.m(div1, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (!current || dirty & /*label*/ 1) set_data_dev$1(t0, /*label*/ ctx[0]);

    			if (!current || dirty & /*color*/ 2) {
    				set_style$1(div0, "color", /*color*/ ctx[1]);
    			}

    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 32) {
    					update_slot$1(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[5], dirty, null, null);
    				}
    			}

    			if (!current || dirty & /*margin*/ 8) {
    				set_style$1(div1, "margin", "0px " + /*margin*/ ctx[3] + " 0px " + /*margin*/ ctx[3]);
    			}

    			if (!current || dirty & /*width*/ 4) {
    				set_style$1(div1, "max-width", /*width*/ ctx[2]);
    			}

    			if (!current || dirty & /*width*/ 4) {
    				set_style$1(div1, "min-width", /*width*/ ctx[2]);
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
    			if (detaching) detach_dev$1(div1);
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
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots$1("Column", slots, ['default']);
    	let { label = "" } = $$props;
    	let { width = "" } = $$props;
    	let { color = "steelblue" } = $$props;
    	color = colors[color] || color;
    	let { title = "" } = $$props;
    	let { margin = "20px" } = $$props;
    	label = label || title;
    	const writable_props = ["label", "width", "color", "title", "margin"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Column> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("label" in $$props) $$invalidate(0, label = $$props.label);
    		if ("width" in $$props) $$invalidate(2, width = $$props.width);
    		if ("color" in $$props) $$invalidate(1, color = $$props.color);
    		if ("title" in $$props) $$invalidate(4, title = $$props.title);
    		if ("margin" in $$props) $$invalidate(3, margin = $$props.margin);
    		if ("$$scope" in $$props) $$invalidate(5, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		colors,
    		label,
    		width,
    		color,
    		title,
    		margin
    	});

    	$$self.$inject_state = $$props => {
    		if ("label" in $$props) $$invalidate(0, label = $$props.label);
    		if ("width" in $$props) $$invalidate(2, width = $$props.width);
    		if ("color" in $$props) $$invalidate(1, color = $$props.color);
    		if ("title" in $$props) $$invalidate(4, title = $$props.title);
    		if ("margin" in $$props) $$invalidate(3, margin = $$props.margin);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [label, color, width, margin, title, $$scope, slots];
    }

    class Column extends SvelteComponentDev$1 {
    	constructor(options) {
    		super(options);
    		if (!document.getElementById("svelte-1sl59b1-style")) add_css$5();

    		init$1(this, options, instance$5, create_fragment$5, safe_not_equal$1, {
    			label: 0,
    			width: 2,
    			color: 1,
    			title: 4,
    			margin: 3
    		});

    		dispatch_dev$1("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Column",
    			options,
    			id: create_fragment$5.name
    		});
    	}

    	get label() {
    		throw new Error("<Column>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set label(value) {
    		throw new Error("<Column>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get width() {
    		throw new Error("<Column>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set width(value) {
    		throw new Error("<Column>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get color() {
    		throw new Error("<Column>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set color(value) {
    		throw new Error("<Column>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get title() {
    		throw new Error("<Column>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set title(value) {
    		throw new Error("<Column>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get margin() {
    		throw new Error("<Column>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set margin(value) {
    		throw new Error("<Column>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* Users/spencer/mountain/somehow-timeline/src/shapes/WideLabel.svelte generated by Svelte v3.29.0 */
    const file$6 = "Users/spencer/mountain/somehow-timeline/src/shapes/WideLabel.svelte";

    function add_css$6() {
    	var style = element$1("style");
    	style.id = "svelte-8burw3-style";
    	style.textContent = ".wide.svelte-8burw3{position:absolute;min-height:3px;font-size:0.8rem}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiV2lkZUxhYmVsLnN2ZWx0ZSIsInNvdXJjZXMiOlsiV2lkZUxhYmVsLnN2ZWx0ZSJdLCJzb3VyY2VzQ29udGVudCI6WyI8c2NyaXB0PlxuICBleHBvcnQgbGV0IGRhdGUgPSAnJ1xuICBleHBvcnQgbGV0IGxhYmVsID0gJydcbiAgZXhwb3J0IGxldCB3aWR0aCA9ICc5MCUnXG4gIGV4cG9ydCBsZXQgbGVmdCA9ICcxMCUnXG4gIGV4cG9ydCBsZXQgYWxpZ24gPSAncmlnaHQnXG4gIGV4cG9ydCBsZXQgY29sb3IgPSAnYmxhY2snXG4gIGltcG9ydCB7IGdldENvbnRleHQgfSBmcm9tICdzdmVsdGUnXG4gIGltcG9ydCBzcGFjZXRpbWUgZnJvbSAnc3BhY2V0aW1lJ1xuICBjb25zdCBzY2FsZSA9IGdldENvbnRleHQoJ3NjYWxlJylcbiAgbGV0IHkgPSBzY2FsZShzcGFjZXRpbWUoZGF0ZSkuZXBvY2gpXG48L3NjcmlwdD5cblxuPHN0eWxlPlxuICAud2lkZSB7XG4gICAgcG9zaXRpb246IGFic29sdXRlO1xuICAgIG1pbi1oZWlnaHQ6IDNweDtcbiAgICBmb250LXNpemU6IDAuOHJlbTtcbiAgfVxuPC9zdHlsZT5cblxuPGRpdlxuICBjbGFzcz1cIndpZGVcIlxuICBzdHlsZT1cInRvcDp7eX1weDsgd2lkdGg6IHt3aWR0aH07IGxlZnQ6e2xlZnR9OyB0ZXh0LWFsaWduOnthbGlnbn07IGNvbG9yOntjb2xvcn07IGJvcmRlci1ib3R0b206IDFweCBzb2xpZCB7Y29sb3J9O1wiPlxuICB7bGFiZWx9XG48L2Rpdj5cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFjRSxLQUFLLGNBQUMsQ0FBQyxBQUNMLFFBQVEsQ0FBRSxRQUFRLENBQ2xCLFVBQVUsQ0FBRSxHQUFHLENBQ2YsU0FBUyxDQUFFLE1BQU0sQUFDbkIsQ0FBQyJ9 */";
    	append_dev$1(document.head, style);
    }

    function create_fragment$6(ctx) {
    	let div;
    	let t;

    	const block = {
    		c: function create() {
    			div = element$1("div");
    			t = text$1(/*label*/ ctx[0]);
    			attr_dev$1(div, "class", "wide svelte-8burw3");
    			set_style$1(div, "top", /*y*/ ctx[5] + "px");
    			set_style$1(div, "width", /*width*/ ctx[1]);
    			set_style$1(div, "left", /*left*/ ctx[2]);
    			set_style$1(div, "text-align", /*align*/ ctx[3]);
    			set_style$1(div, "color", /*color*/ ctx[4]);
    			set_style$1(div, "border-bottom", "1px solid " + /*color*/ ctx[4]);
    			add_location$1(div, file$6, 21, 0, 427);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev$1(target, div, anchor);
    			append_dev$1(div, t);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*label*/ 1) set_data_dev$1(t, /*label*/ ctx[0]);

    			if (dirty & /*width*/ 2) {
    				set_style$1(div, "width", /*width*/ ctx[1]);
    			}

    			if (dirty & /*left*/ 4) {
    				set_style$1(div, "left", /*left*/ ctx[2]);
    			}

    			if (dirty & /*align*/ 8) {
    				set_style$1(div, "text-align", /*align*/ ctx[3]);
    			}

    			if (dirty & /*color*/ 16) {
    				set_style$1(div, "color", /*color*/ ctx[4]);
    			}

    			if (dirty & /*color*/ 16) {
    				set_style$1(div, "border-bottom", "1px solid " + /*color*/ ctx[4]);
    			}
    		},
    		i: noop$1,
    		o: noop$1,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev$1(div);
    		}
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
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots$1("WideLabel", slots, []);
    	let { date = "" } = $$props;
    	let { label = "" } = $$props;
    	let { width = "90%" } = $$props;
    	let { left = "10%" } = $$props;
    	let { align = "right" } = $$props;
    	let { color = "black" } = $$props;
    	const scale = getContext("scale");
    	let y = scale(src(date).epoch);
    	const writable_props = ["date", "label", "width", "left", "align", "color"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<WideLabel> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("date" in $$props) $$invalidate(6, date = $$props.date);
    		if ("label" in $$props) $$invalidate(0, label = $$props.label);
    		if ("width" in $$props) $$invalidate(1, width = $$props.width);
    		if ("left" in $$props) $$invalidate(2, left = $$props.left);
    		if ("align" in $$props) $$invalidate(3, align = $$props.align);
    		if ("color" in $$props) $$invalidate(4, color = $$props.color);
    	};

    	$$self.$capture_state = () => ({
    		date,
    		label,
    		width,
    		left,
    		align,
    		color,
    		getContext,
    		spacetime: src,
    		scale,
    		y
    	});

    	$$self.$inject_state = $$props => {
    		if ("date" in $$props) $$invalidate(6, date = $$props.date);
    		if ("label" in $$props) $$invalidate(0, label = $$props.label);
    		if ("width" in $$props) $$invalidate(1, width = $$props.width);
    		if ("left" in $$props) $$invalidate(2, left = $$props.left);
    		if ("align" in $$props) $$invalidate(3, align = $$props.align);
    		if ("color" in $$props) $$invalidate(4, color = $$props.color);
    		if ("y" in $$props) $$invalidate(5, y = $$props.y);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [label, width, left, align, color, y, date];
    }

    class WideLabel extends SvelteComponentDev$1 {
    	constructor(options) {
    		super(options);
    		if (!document.getElementById("svelte-8burw3-style")) add_css$6();

    		init$1(this, options, instance$6, create_fragment$6, safe_not_equal$1, {
    			date: 6,
    			label: 0,
    			width: 1,
    			left: 2,
    			align: 3,
    			color: 4
    		});

    		dispatch_dev$1("SvelteRegisterComponent", {
    			component: this,
    			tagName: "WideLabel",
    			options,
    			id: create_fragment$6.name
    		});
    	}

    	get date() {
    		throw new Error("<WideLabel>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set date(value) {
    		throw new Error("<WideLabel>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get label() {
    		throw new Error("<WideLabel>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set label(value) {
    		throw new Error("<WideLabel>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get width() {
    		throw new Error("<WideLabel>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set width(value) {
    		throw new Error("<WideLabel>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get left() {
    		throw new Error("<WideLabel>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set left(value) {
    		throw new Error("<WideLabel>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get align() {
    		throw new Error("<WideLabel>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set align(value) {
    		throw new Error("<WideLabel>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get color() {
    		throw new Error("<WideLabel>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set color(value) {
    		throw new Error("<WideLabel>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* Users/spencer/mountain/somehow-timeline/src/shapes/Now.svelte generated by Svelte v3.29.0 */
    const file$7 = "Users/spencer/mountain/somehow-timeline/src/shapes/Now.svelte";

    function add_css$7() {
    	var style = element$1("style");
    	style.id = "svelte-fvmo05-style";
    	style.textContent = ".line.svelte-fvmo05{position:relative;margin:0px}.container.svelte-fvmo05{z-index:-1;width:100%;height:100%;position:absolute}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTm93LnN2ZWx0ZSIsInNvdXJjZXMiOlsiTm93LnN2ZWx0ZSJdLCJzb3VyY2VzQ29udGVudCI6WyI8c2NyaXB0PlxuICBpbXBvcnQgc3BhY2V0aW1lIGZyb20gJ3NwYWNldGltZSdcbiAgaW1wb3J0IHsgZ2V0Q29udGV4dCB9IGZyb20gJ3N2ZWx0ZSdcbiAgaW1wb3J0IGNvbG9ycyBmcm9tICcuLi9fbGliL2NvbG9ycy5qcydcbiAgZXhwb3J0IGxldCBjb2xvciA9ICdsaWdodCdcbiAgZXhwb3J0IGxldCB3aWR0aCA9ICcycHgnXG4gIGV4cG9ydCBsZXQgbGFiZWwgPSAnJ1xuICBleHBvcnQgbGV0IG5vdyA9IHNwYWNldGltZS5ub3coKS5lcG9jaFxuICBjb2xvciA9IGNvbG9yc1tjb2xvcl0gfHwgY29sb3JcbiAgbGV0IHN0YXJ0ID0gZ2V0Q29udGV4dCgnc3RhcnQnKVxuICBsZXQgZW5kID0gZ2V0Q29udGV4dCgnZW5kJylcblxuICBjb25zdCBzY2FsZSA9IGdldENvbnRleHQoJ3NjYWxlJylcbiAgJDogeSA9IHNjYWxlKG5vdylcbiAgLy8gJDogeSA9IDIwMFxuICAvLyAkOiBoZWlnaHQgPSBib3R0b20gLSB0b3Bcbjwvc2NyaXB0PlxuXG48ZGl2IGNsYXNzPVwiY29udGFpbmVyXCI+XG4gIDwhLS0gPGRpdiBjbGFzcz1cIndpZGUgbGFiZWxcIiBzdHlsZT1cInRvcDp7aGVpZ2h0fXB4O1wiPntsYWJlbH08L2Rpdj4gLS0+XG4gIDwhLS0gPGRpdiBjbGFzcz1cIlwiPiAtLT5cbiAgPGRpdiBjbGFzcz1cImxpbmVcIiBzdHlsZT1cImJvcmRlci1ib3R0b206IHt3aWR0aH0gZGFzaGVkIHtjb2xvcn07IHRvcDp7eX1weDtcIiAvPlxuICA8IS0tIDxkaXYgY2xhc3M9XCJsYWJlbFwiIHN0eWxlPVwidG9wOntoZWlnaHR9cHg7IGNvbG9yOmxpZ2h0Z3JleTtcIj57bGFiZWx9PC9kaXY+IC0tPlxuICA8IS0tIDxkaXYgY2xhc3M9XCJsaW5lIGZ1dHVyZVwiIHN0eWxlPVwiYm9yZGVyLWxlZnQ6IHt3aWR0aH0gZGFzaGVkIHtjb2xvcn07IGhlaWdodDoxMDAlO1wiIC8+IC0tPlxuICA8IS0tIDwvZGl2PiAtLT5cbjwvZGl2PlxuXG48c3R5bGU+XG4gIC5saW5lIHtcbiAgICBwb3NpdGlvbjogcmVsYXRpdmU7XG4gICAgbWFyZ2luOiAwcHg7XG4gIH1cblxuICAuY29udGFpbmVyIHtcbiAgICB6LWluZGV4OiAtMTtcbiAgICB3aWR0aDogMTAwJTtcbiAgICBoZWlnaHQ6IDEwMCU7XG4gICAgcG9zaXRpb246IGFic29sdXRlO1xuICB9XG48L3N0eWxlPlxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQTRCRSxLQUFLLGNBQUMsQ0FBQyxBQUNMLFFBQVEsQ0FBRSxRQUFRLENBQ2xCLE1BQU0sQ0FBRSxHQUFHLEFBQ2IsQ0FBQyxBQUVELFVBQVUsY0FBQyxDQUFDLEFBQ1YsT0FBTyxDQUFFLEVBQUUsQ0FDWCxLQUFLLENBQUUsSUFBSSxDQUNYLE1BQU0sQ0FBRSxJQUFJLENBQ1osUUFBUSxDQUFFLFFBQVEsQUFDcEIsQ0FBQyJ9 */";
    	append_dev$1(document.head, style);
    }

    function create_fragment$7(ctx) {
    	let div1;
    	let div0;

    	const block = {
    		c: function create() {
    			div1 = element$1("div");
    			div0 = element$1("div");
    			attr_dev$1(div0, "class", "line svelte-fvmo05");
    			set_style$1(div0, "border-bottom", /*width*/ ctx[1] + " dashed " + /*color*/ ctx[0]);
    			set_style$1(div0, "top", /*y*/ ctx[2] + "px");
    			add_location$1(div0, file$7, 21, 2, 581);
    			attr_dev$1(div1, "class", "container svelte-fvmo05");
    			add_location$1(div1, file$7, 18, 0, 456);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev$1(target, div1, anchor);
    			append_dev$1(div1, div0);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*width, color*/ 3) {
    				set_style$1(div0, "border-bottom", /*width*/ ctx[1] + " dashed " + /*color*/ ctx[0]);
    			}

    			if (dirty & /*y*/ 4) {
    				set_style$1(div0, "top", /*y*/ ctx[2] + "px");
    			}
    		},
    		i: noop$1,
    		o: noop$1,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev$1(div1);
    		}
    	};

    	dispatch_dev$1("SvelteRegisterBlock", {
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
    	validate_slots$1("Now", slots, []);
    	let { color = "light" } = $$props;
    	let { width = "2px" } = $$props;
    	let { label = "" } = $$props;
    	let { now = src.now().epoch } = $$props;
    	color = colors[color] || color;
    	let start = getContext("start");
    	let end = getContext("end");
    	const scale = getContext("scale");
    	const writable_props = ["color", "width", "label", "now"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Now> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("color" in $$props) $$invalidate(0, color = $$props.color);
    		if ("width" in $$props) $$invalidate(1, width = $$props.width);
    		if ("label" in $$props) $$invalidate(3, label = $$props.label);
    		if ("now" in $$props) $$invalidate(4, now = $$props.now);
    	};

    	$$self.$capture_state = () => ({
    		spacetime: src,
    		getContext,
    		colors,
    		color,
    		width,
    		label,
    		now,
    		start,
    		end,
    		scale,
    		y
    	});

    	$$self.$inject_state = $$props => {
    		if ("color" in $$props) $$invalidate(0, color = $$props.color);
    		if ("width" in $$props) $$invalidate(1, width = $$props.width);
    		if ("label" in $$props) $$invalidate(3, label = $$props.label);
    		if ("now" in $$props) $$invalidate(4, now = $$props.now);
    		if ("start" in $$props) start = $$props.start;
    		if ("end" in $$props) end = $$props.end;
    		if ("y" in $$props) $$invalidate(2, y = $$props.y);
    	};

    	let y;

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*now*/ 16) {
    			 $$invalidate(2, y = scale(now));
    		}
    	};

    	return [color, width, y, label, now];
    }

    class Now extends SvelteComponentDev$1 {
    	constructor(options) {
    		super(options);
    		if (!document.getElementById("svelte-fvmo05-style")) add_css$7();
    		init$1(this, options, instance$7, create_fragment$7, safe_not_equal$1, { color: 0, width: 1, label: 3, now: 4 });

    		dispatch_dev$1("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Now",
    			options,
    			id: create_fragment$7.name
    		});
    	}

    	get color() {
    		throw new Error("<Now>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set color(value) {
    		throw new Error("<Now>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get width() {
    		throw new Error("<Now>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set width(value) {
    		throw new Error("<Now>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get label() {
    		throw new Error("<Now>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set label(value) {
    		throw new Error("<Now>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get now() {
    		throw new Error("<Now>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set now(value) {
    		throw new Error("<Now>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* Users/spencer/mountain/somehow-timeline/src/shapes/Dots.svelte generated by Svelte v3.29.0 */

    const file$8 = "Users/spencer/mountain/somehow-timeline/src/shapes/Dots.svelte";

    function create_fragment$8(ctx) {
    	let svg;
    	let defs;
    	let pattern;
    	let circle;
    	let rect;
    	let rect_fill_value;

    	const block = {
    		c: function create() {
    			svg = svg_element$1("svg");
    			defs = svg_element$1("defs");
    			pattern = svg_element$1("pattern");
    			circle = svg_element$1("circle");
    			rect = svg_element$1("rect");
    			attr_dev$1(circle, "fill", /*color*/ ctx[0]);
    			attr_dev$1(circle, "cx", "3");
    			attr_dev$1(circle, "cy", "3");
    			attr_dev$1(circle, "r", "1.5");
    			add_location$1(circle, file$8, 19, 6, 413);
    			attr_dev$1(pattern, "id", /*id*/ ctx[1]);
    			attr_dev$1(pattern, "x", "0");
    			attr_dev$1(pattern, "y", "0");
    			attr_dev$1(pattern, "width", "5");
    			attr_dev$1(pattern, "height", "5");
    			attr_dev$1(pattern, "patternUnits", "userSpaceOnUse");
    			add_location$1(pattern, file$8, 18, 4, 329);
    			add_location$1(defs, file$8, 17, 2, 318);
    			attr_dev$1(rect, "x", "0");
    			attr_dev$1(rect, "y", "0");
    			attr_dev$1(rect, "width", "100%");
    			attr_dev$1(rect, "height", "100%");
    			attr_dev$1(rect, "fill", rect_fill_value = "url(#" + /*id*/ ctx[1] + ")");
    			add_location$1(rect, file$8, 23, 2, 487);
    			attr_dev$1(svg, "width", "100%");
    			attr_dev$1(svg, "height", "100%");
    			add_location$1(svg, file$8, 16, 0, 283);
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
    		id: create_fragment$8.name,
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

    function instance$8($$self, $$props, $$invalidate) {
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
    		init$1(this, options, instance$8, create_fragment$8, safe_not_equal$1, { color: 0 });

    		dispatch_dev$1("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Dots",
    			options,
    			id: create_fragment$8.name
    		});
    	}

    	get color() {
    		throw new Error("<Dots>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set color(value) {
    		throw new Error("<Dots>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* Users/spencer/mountain/somehow-timeline/src/shapes/Line.svelte generated by Svelte v3.29.0 */
    const file$9 = "Users/spencer/mountain/somehow-timeline/src/shapes/Line.svelte";

    function add_css$8() {
    	var style = element$1("style");
    	style.id = "svelte-6j65ft-style";
    	style.textContent = ".container.svelte-6j65ft{width:100%;position:absolute;border-radius:5px;display:flex;flex-direction:row;justify-content:space-around;align-items:center;text-align:center;flex-wrap:wrap;align-self:stretch}.line.svelte-6j65ft{height:100%;width:100%;cursor:default;border-radius:3px;z-index:1;box-shadow:2px 2px 8px 0px rgba(0, 0, 0, 0.2)}.line.svelte-6j65ft:hover{opacity:1;box-shadow:2px 2px 8px 0px steelblue}.dots.svelte-6j65ft{position:absolute;top:0px;height:100%;width:100%;z-index:0}.topLabel.svelte-6j65ft{width:100%;position:relative;white-space:nowrap;z-index:4;user-select:none;font-size:11px}.midLabel.svelte-6j65ft{position:absolute;z-index:3;color:#fbfbfb;font-size:12px;line-height:1.2rem}.rotate.svelte-6j65ft{writing-mode:vertical-lr;transform:rotate(-180deg)}.hide.svelte-6j65ft{display:none}@media only screen and (max-width: 600px){.midLabel.svelte-6j65ft{font-size:11px}}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTGluZS5zdmVsdGUiLCJzb3VyY2VzIjpbIkxpbmUuc3ZlbHRlIl0sInNvdXJjZXNDb250ZW50IjpbIjxzY3JpcHQ+XG4gIGltcG9ydCBzcGFjZXRpbWUgZnJvbSAnc3BhY2V0aW1lJ1xuICBpbXBvcnQgeyBnZXRDb250ZXh0IH0gZnJvbSAnc3ZlbHRlJ1xuICBpbXBvcnQgRG90cyBmcm9tICcuL0RvdHMuc3ZlbHRlJ1xuICBpbXBvcnQgY29sb3JzIGZyb20gJy4uL19saWIvY29sb3JzLmpzJ1xuXG4gIGxldCBteVNjYWxlID0gZ2V0Q29udGV4dCgnc2NhbGUnKVxuICBleHBvcnQgbGV0IGNvbG9yID0gJ3N0ZWVsYmx1ZSdcbiAgZXhwb3J0IGxldCB3aWR0aCA9ICcxMDAlJ1xuICBleHBvcnQgbGV0IGhpZGUgPSBmYWxzZVxuICBleHBvcnQgbGV0IHRpdGxlID0gJydcbiAgZXhwb3J0IGxldCBtYXJnaW4gPSAyXG4gIGV4cG9ydCBsZXQgb3BhY2l0eSA9ICcwLjcnXG4gIGV4cG9ydCBsZXQgbGFiZWwgPSAnJ1xuICBleHBvcnQgbGV0IHVuZGVybGluZSA9ICdub25lJ1xuICBleHBvcnQgbGV0IGRvdHRlZCA9IGZhbHNlXG4gIGV4cG9ydCBsZXQgcm90YXRlID0gZmFsc2VcbiAgZXhwb3J0IGxldCBkdXJhdGlvbiA9ICcnXG4gIGV4cG9ydCBsZXQgc3RhcnQgPSBnZXRDb250ZXh0KCdzdGFydCcpXG4gIGV4cG9ydCBsZXQgZGF0ZSA9ICcnXG4gIHN0YXJ0ID0gZGF0ZSB8fCBzdGFydFxuICBleHBvcnQgbGV0IGVuZCA9IGdldENvbnRleHQoJ2VuZCcpXG4gIHN0YXJ0ID0gc3BhY2V0aW1lKHN0YXJ0KVxuICBpZiAoIWVuZCAmJiBkdXJhdGlvbikge1xuICAgIGxldCB3b3JkcyA9IGR1cmF0aW9uLnNwbGl0KCcgJylcbiAgICBlbmQgPSBzdGFydC5hZGQod29yZHNbMF0sIHdvcmRzWzFdKVxuICB9XG5cbiAgY29sb3IgPSBjb2xvcnNbY29sb3JdIHx8IGNvbG9yXG4gIHN0YXJ0ID0gc3RhcnQuZXBvY2hcbiAgZW5kID0gc3BhY2V0aW1lKGVuZCkuZXBvY2hcblxuICBpZiAoZHVyYXRpb24pIHtcbiAgICBsZXQgc3BsaXQgPSBkdXJhdGlvbi5zcGxpdCgnICcpXG4gICAgZW5kID0gc3BhY2V0aW1lKHN0YXJ0KS5hZGQoTnVtYmVyKHNwbGl0WzBdKSwgc3BsaXRbMV0pLmVwb2NoXG4gIH1cblxuICBjb25zdCBzY2FsZSA9IGdldENvbnRleHQoJ3NjYWxlJylcbiAgJDogdG9wID0gbXlTY2FsZShzdGFydClcbiAgJDogYm90dG9tID0gbXlTY2FsZShlbmQpXG4gICQ6IGhlaWdodCA9IGJvdHRvbSAtIHRvcFxuPC9zY3JpcHQ+XG5cbjxkaXYgY2xhc3M9XCJjb250YWluZXJcIiBzdHlsZT1cIm9wYWNpdHk6e29wYWNpdHl9OyB0b3A6e3RvcCArIG1hcmdpbn1weDsgaGVpZ2h0OntoZWlnaHQgLSBtYXJnaW4gKiAyfXB4OyBcIiB7dGl0bGV9PlxuICA8IS0tIGxhYmVsIC0tPlxuICB7I2lmIGhlaWdodCA+IDIwfVxuICAgIDxkaXYgY2xhc3M9XCJtaWRMYWJlbFwiIGNsYXNzOnJvdGF0ZSBjbGFzczpoaWRlPlxuICAgICAge0BodG1sIGxhYmVsfVxuICAgIDwvZGl2PlxuICB7OmVsc2V9XG4gICAgPGRpdlxuICAgICAgY2xhc3M9XCJ0b3BMYWJlbFwiXG4gICAgICBzdHlsZT1cImNvbG9yOntjb2xvcn07IHRleHQtZGVjb3JhdGlvbjp7dW5kZXJsaW5lID09PSB0cnVlID8gJ3VuZGVybGluZScgOiAnbm9uZSd9O1wiXG4gICAgICBjbGFzczpyb3RhdGVcbiAgICAgIGNsYXNzOmhpZGVcbiAgICA+XG4gICAgICB7QGh0bWwgbGFiZWx9XG4gICAgPC9kaXY+XG4gIHsvaWZ9XG5cbiAgPCEtLSBsaW5lIC0tPlxuICA8ZGl2IGNsYXNzPVwibGluZVwiIHN0eWxlPVwid2lkdGg6e3dpZHRofTsgYmFja2dyb3VuZC1jb2xvcjp7Y29sb3J9O1wiIC8+XG5cbiAgeyNpZiBkb3R0ZWQgPT09IHRydWV9XG4gICAgPGRpdiBjbGFzcz1cImRvdHNcIiBzdHlsZT1cImJhY2tncm91bmQtY29sb3I6IHsnd2hpdGUnfTtcIj5cbiAgICAgIDxEb3RzIHtjb2xvcn0gLz5cbiAgICA8L2Rpdj5cbiAgey9pZn1cbjwvZGl2PlxuXG48c3R5bGU+XG4gIC5jb250YWluZXIge1xuICAgIHdpZHRoOiAxMDAlO1xuICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgICBib3JkZXItcmFkaXVzOiA1cHg7XG5cbiAgICBkaXNwbGF5OiBmbGV4O1xuICAgIGZsZXgtZGlyZWN0aW9uOiByb3c7XG4gICAganVzdGlmeS1jb250ZW50OiBzcGFjZS1hcm91bmQ7XG4gICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICB0ZXh0LWFsaWduOiBjZW50ZXI7XG4gICAgZmxleC13cmFwOiB3cmFwO1xuICAgIGFsaWduLXNlbGY6IHN0cmV0Y2g7XG4gIH1cbiAgLmxpbmUge1xuICAgIGhlaWdodDogMTAwJTtcbiAgICB3aWR0aDogMTAwJTtcbiAgICBjdXJzb3I6IGRlZmF1bHQ7XG4gICAgYm9yZGVyLXJhZGl1czogM3B4O1xuICAgIHotaW5kZXg6IDE7XG4gICAgYm94LXNoYWRvdzogMnB4IDJweCA4cHggMHB4IHJnYmEoMCwgMCwgMCwgMC4yKTtcbiAgfVxuICAubGluZTpob3ZlciB7XG4gICAgb3BhY2l0eTogMTtcbiAgICBib3gtc2hhZG93OiAycHggMnB4IDhweCAwcHggc3RlZWxibHVlO1xuICB9XG4gIC5kb3RzIHtcbiAgICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gICAgdG9wOiAwcHg7XG4gICAgaGVpZ2h0OiAxMDAlO1xuICAgIHdpZHRoOiAxMDAlO1xuICAgIHotaW5kZXg6IDA7XG4gIH1cbiAgLnRvcExhYmVsIHtcbiAgICB3aWR0aDogMTAwJTtcbiAgICBwb3NpdGlvbjogcmVsYXRpdmU7XG4gICAgd2hpdGUtc3BhY2U6IG5vd3JhcDtcbiAgICB6LWluZGV4OiA0O1xuICAgIHVzZXItc2VsZWN0OiBub25lO1xuICAgIGZvbnQtc2l6ZTogMTFweDtcbiAgfVxuICAubWlkTGFiZWwge1xuICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgICB6LWluZGV4OiAzO1xuICAgIGNvbG9yOiAjZmJmYmZiO1xuICAgIGZvbnQtc2l6ZTogMTJweDtcbiAgICBsaW5lLWhlaWdodDogMS4ycmVtO1xuICB9XG4gIC5yb3RhdGUge1xuICAgIHdyaXRpbmctbW9kZTogdmVydGljYWwtbHI7XG4gICAgdHJhbnNmb3JtOiByb3RhdGUoLTE4MGRlZyk7XG4gIH1cbiAgLmhpZGUge1xuICAgIGRpc3BsYXk6IG5vbmU7XG4gIH1cbiAgQG1lZGlhIG9ubHkgc2NyZWVuIGFuZCAobWF4LXdpZHRoOiA2MDBweCkge1xuICAgIC5taWRMYWJlbCB7XG4gICAgICBmb250LXNpemU6IDExcHg7XG4gICAgfVxuICB9XG48L3N0eWxlPlxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQXVFRSxVQUFVLGNBQUMsQ0FBQyxBQUNWLEtBQUssQ0FBRSxJQUFJLENBQ1gsUUFBUSxDQUFFLFFBQVEsQ0FDbEIsYUFBYSxDQUFFLEdBQUcsQ0FFbEIsT0FBTyxDQUFFLElBQUksQ0FDYixjQUFjLENBQUUsR0FBRyxDQUNuQixlQUFlLENBQUUsWUFBWSxDQUM3QixXQUFXLENBQUUsTUFBTSxDQUNuQixVQUFVLENBQUUsTUFBTSxDQUNsQixTQUFTLENBQUUsSUFBSSxDQUNmLFVBQVUsQ0FBRSxPQUFPLEFBQ3JCLENBQUMsQUFDRCxLQUFLLGNBQUMsQ0FBQyxBQUNMLE1BQU0sQ0FBRSxJQUFJLENBQ1osS0FBSyxDQUFFLElBQUksQ0FDWCxNQUFNLENBQUUsT0FBTyxDQUNmLGFBQWEsQ0FBRSxHQUFHLENBQ2xCLE9BQU8sQ0FBRSxDQUFDLENBQ1YsVUFBVSxDQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxBQUNoRCxDQUFDLEFBQ0QsbUJBQUssTUFBTSxBQUFDLENBQUMsQUFDWCxPQUFPLENBQUUsQ0FBQyxDQUNWLFVBQVUsQ0FBRSxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsU0FBUyxBQUN2QyxDQUFDLEFBQ0QsS0FBSyxjQUFDLENBQUMsQUFDTCxRQUFRLENBQUUsUUFBUSxDQUNsQixHQUFHLENBQUUsR0FBRyxDQUNSLE1BQU0sQ0FBRSxJQUFJLENBQ1osS0FBSyxDQUFFLElBQUksQ0FDWCxPQUFPLENBQUUsQ0FBQyxBQUNaLENBQUMsQUFDRCxTQUFTLGNBQUMsQ0FBQyxBQUNULEtBQUssQ0FBRSxJQUFJLENBQ1gsUUFBUSxDQUFFLFFBQVEsQ0FDbEIsV0FBVyxDQUFFLE1BQU0sQ0FDbkIsT0FBTyxDQUFFLENBQUMsQ0FDVixXQUFXLENBQUUsSUFBSSxDQUNqQixTQUFTLENBQUUsSUFBSSxBQUNqQixDQUFDLEFBQ0QsU0FBUyxjQUFDLENBQUMsQUFDVCxRQUFRLENBQUUsUUFBUSxDQUNsQixPQUFPLENBQUUsQ0FBQyxDQUNWLEtBQUssQ0FBRSxPQUFPLENBQ2QsU0FBUyxDQUFFLElBQUksQ0FDZixXQUFXLENBQUUsTUFBTSxBQUNyQixDQUFDLEFBQ0QsT0FBTyxjQUFDLENBQUMsQUFDUCxZQUFZLENBQUUsV0FBVyxDQUN6QixTQUFTLENBQUUsT0FBTyxPQUFPLENBQUMsQUFDNUIsQ0FBQyxBQUNELEtBQUssY0FBQyxDQUFDLEFBQ0wsT0FBTyxDQUFFLElBQUksQUFDZixDQUFDLEFBQ0QsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxZQUFZLEtBQUssQ0FBQyxBQUFDLENBQUMsQUFDekMsU0FBUyxjQUFDLENBQUMsQUFDVCxTQUFTLENBQUUsSUFBSSxBQUNqQixDQUFDLEFBQ0gsQ0FBQyJ9 */";
    	append_dev$1(document.head, style);
    }

    // (50:2) {:else}
    function create_else_block(ctx) {
    	let div;

    	const block = {
    		c: function create() {
    			div = element$1("div");
    			attr_dev$1(div, "class", "topLabel svelte-6j65ft");
    			set_style$1(div, "color", /*color*/ ctx[0]);
    			set_style$1(div, "text-decoration", /*underline*/ ctx[7] === true ? "underline" : "none");
    			toggle_class$1(div, "rotate", /*rotate*/ ctx[9]);
    			toggle_class$1(div, "hide", /*hide*/ ctx[2]);
    			add_location$1(div, file$9, 50, 4, 1341);
    		},
    		m: function mount(target, anchor) {
    			insert_dev$1(target, div, anchor);
    			div.innerHTML = /*label*/ ctx[6];
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*label*/ 64) div.innerHTML = /*label*/ ctx[6];
    			if (dirty & /*color*/ 1) {
    				set_style$1(div, "color", /*color*/ ctx[0]);
    			}

    			if (dirty & /*underline*/ 128) {
    				set_style$1(div, "text-decoration", /*underline*/ ctx[7] === true ? "underline" : "none");
    			}

    			if (dirty & /*rotate*/ 512) {
    				toggle_class$1(div, "rotate", /*rotate*/ ctx[9]);
    			}

    			if (dirty & /*hide*/ 4) {
    				toggle_class$1(div, "hide", /*hide*/ ctx[2]);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev$1(div);
    		}
    	};

    	dispatch_dev$1("SvelteRegisterBlock", {
    		block,
    		id: create_else_block.name,
    		type: "else",
    		source: "(50:2) {:else}",
    		ctx
    	});

    	return block;
    }

    // (46:2) {#if height > 20}
    function create_if_block_1(ctx) {
    	let div;

    	const block = {
    		c: function create() {
    			div = element$1("div");
    			attr_dev$1(div, "class", "midLabel svelte-6j65ft");
    			toggle_class$1(div, "rotate", /*rotate*/ ctx[9]);
    			toggle_class$1(div, "hide", /*hide*/ ctx[2]);
    			add_location$1(div, file$9, 46, 4, 1249);
    		},
    		m: function mount(target, anchor) {
    			insert_dev$1(target, div, anchor);
    			div.innerHTML = /*label*/ ctx[6];
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*label*/ 64) div.innerHTML = /*label*/ ctx[6];
    			if (dirty & /*rotate*/ 512) {
    				toggle_class$1(div, "rotate", /*rotate*/ ctx[9]);
    			}

    			if (dirty & /*hide*/ 4) {
    				toggle_class$1(div, "hide", /*hide*/ ctx[2]);
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
    		source: "(46:2) {#if height > 20}",
    		ctx
    	});

    	return block;
    }

    // (64:2) {#if dotted === true}
    function create_if_block(ctx) {
    	let div;
    	let dots;
    	let current;

    	dots = new Dots({
    			props: { color: /*color*/ ctx[0] },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			div = element$1("div");
    			create_component$1(dots.$$.fragment);
    			attr_dev$1(div, "class", "dots svelte-6j65ft");
    			set_style$1(div, "background-color", "white");
    			add_location$1(div, file$9, 64, 4, 1658);
    		},
    		m: function mount(target, anchor) {
    			insert_dev$1(target, div, anchor);
    			mount_component$1(dots, div, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const dots_changes = {};
    			if (dirty & /*color*/ 1) dots_changes.color = /*color*/ ctx[0];
    			dots.$set(dots_changes);
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
    		id: create_if_block.name,
    		type: "if",
    		source: "(64:2) {#if dotted === true}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$9(ctx) {
    	let div1;
    	let t0;
    	let div0;
    	let t1;
    	let current;

    	function select_block_type(ctx, dirty) {
    		if (/*height*/ ctx[11] > 20) return create_if_block_1;
    		return create_else_block;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block0 = current_block_type(ctx);
    	let if_block1 = /*dotted*/ ctx[8] === true && create_if_block(ctx);

    	const block = {
    		c: function create() {
    			div1 = element$1("div");
    			if_block0.c();
    			t0 = space$1();
    			div0 = element$1("div");
    			t1 = space$1();
    			if (if_block1) if_block1.c();
    			attr_dev$1(div0, "class", "line svelte-6j65ft");
    			set_style$1(div0, "width", /*width*/ ctx[1]);
    			set_style$1(div0, "background-color", /*color*/ ctx[0]);
    			add_location$1(div0, file$9, 61, 2, 1559);
    			attr_dev$1(div1, "class", "container svelte-6j65ft");
    			set_style$1(div1, "opacity", /*opacity*/ ctx[5]);
    			set_style$1(div1, "top", /*top*/ ctx[10] + /*margin*/ ctx[4] + "px");
    			set_style$1(div1, "height", /*height*/ ctx[11] - /*margin*/ ctx[4] * 2 + "px");
    			attr_dev$1(div1, "title", /*title*/ ctx[3]);
    			add_location$1(div1, file$9, 43, 0, 1094);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev$1(target, div1, anchor);
    			if_block0.m(div1, null);
    			append_dev$1(div1, t0);
    			append_dev$1(div1, div0);
    			append_dev$1(div1, t1);
    			if (if_block1) if_block1.m(div1, null);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block0) {
    				if_block0.p(ctx, dirty);
    			} else {
    				if_block0.d(1);
    				if_block0 = current_block_type(ctx);

    				if (if_block0) {
    					if_block0.c();
    					if_block0.m(div1, t0);
    				}
    			}

    			if (!current || dirty & /*width*/ 2) {
    				set_style$1(div0, "width", /*width*/ ctx[1]);
    			}

    			if (!current || dirty & /*color*/ 1) {
    				set_style$1(div0, "background-color", /*color*/ ctx[0]);
    			}

    			if (/*dotted*/ ctx[8] === true) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty & /*dotted*/ 256) {
    						transition_in$1(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block(ctx);
    					if_block1.c();
    					transition_in$1(if_block1, 1);
    					if_block1.m(div1, null);
    				}
    			} else if (if_block1) {
    				group_outros$1();

    				transition_out$1(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros$1();
    			}

    			if (!current || dirty & /*opacity*/ 32) {
    				set_style$1(div1, "opacity", /*opacity*/ ctx[5]);
    			}

    			if (!current || dirty & /*top, margin*/ 1040) {
    				set_style$1(div1, "top", /*top*/ ctx[10] + /*margin*/ ctx[4] + "px");
    			}

    			if (!current || dirty & /*height, margin*/ 2064) {
    				set_style$1(div1, "height", /*height*/ ctx[11] - /*margin*/ ctx[4] * 2 + "px");
    			}

    			if (!current || dirty & /*title*/ 8) {
    				attr_dev$1(div1, "title", /*title*/ ctx[3]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in$1(if_block1);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out$1(if_block1);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev$1(div1);
    			if_block0.d();
    			if (if_block1) if_block1.d();
    		}
    	};

    	dispatch_dev$1("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$9.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$9($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots$1("Line", slots, []);
    	let myScale = getContext("scale");
    	let { color = "steelblue" } = $$props;
    	let { width = "100%" } = $$props;
    	let { hide = false } = $$props;
    	let { title = "" } = $$props;
    	let { margin = 2 } = $$props;
    	let { opacity = "0.7" } = $$props;
    	let { label = "" } = $$props;
    	let { underline = "none" } = $$props;
    	let { dotted = false } = $$props;
    	let { rotate = false } = $$props;
    	let { duration = "" } = $$props;
    	let { start = getContext("start") } = $$props;
    	let { date = "" } = $$props;
    	start = date || start;
    	let { end = getContext("end") } = $$props;
    	start = src(start);

    	if (!end && duration) {
    		let words = duration.split(" ");
    		end = start.add(words[0], words[1]);
    	}

    	color = colors[color] || color;
    	start = start.epoch;
    	end = src(end).epoch;

    	if (duration) {
    		let split = duration.split(" ");
    		end = src(start).add(Number(split[0]), split[1]).epoch;
    	}

    	const scale = getContext("scale");

    	const writable_props = [
    		"color",
    		"width",
    		"hide",
    		"title",
    		"margin",
    		"opacity",
    		"label",
    		"underline",
    		"dotted",
    		"rotate",
    		"duration",
    		"start",
    		"date",
    		"end"
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Line> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("color" in $$props) $$invalidate(0, color = $$props.color);
    		if ("width" in $$props) $$invalidate(1, width = $$props.width);
    		if ("hide" in $$props) $$invalidate(2, hide = $$props.hide);
    		if ("title" in $$props) $$invalidate(3, title = $$props.title);
    		if ("margin" in $$props) $$invalidate(4, margin = $$props.margin);
    		if ("opacity" in $$props) $$invalidate(5, opacity = $$props.opacity);
    		if ("label" in $$props) $$invalidate(6, label = $$props.label);
    		if ("underline" in $$props) $$invalidate(7, underline = $$props.underline);
    		if ("dotted" in $$props) $$invalidate(8, dotted = $$props.dotted);
    		if ("rotate" in $$props) $$invalidate(9, rotate = $$props.rotate);
    		if ("duration" in $$props) $$invalidate(14, duration = $$props.duration);
    		if ("start" in $$props) $$invalidate(12, start = $$props.start);
    		if ("date" in $$props) $$invalidate(15, date = $$props.date);
    		if ("end" in $$props) $$invalidate(13, end = $$props.end);
    	};

    	$$self.$capture_state = () => ({
    		spacetime: src,
    		getContext,
    		Dots,
    		colors,
    		myScale,
    		color,
    		width,
    		hide,
    		title,
    		margin,
    		opacity,
    		label,
    		underline,
    		dotted,
    		rotate,
    		duration,
    		start,
    		date,
    		end,
    		scale,
    		top,
    		bottom,
    		height
    	});

    	$$self.$inject_state = $$props => {
    		if ("myScale" in $$props) $$invalidate(17, myScale = $$props.myScale);
    		if ("color" in $$props) $$invalidate(0, color = $$props.color);
    		if ("width" in $$props) $$invalidate(1, width = $$props.width);
    		if ("hide" in $$props) $$invalidate(2, hide = $$props.hide);
    		if ("title" in $$props) $$invalidate(3, title = $$props.title);
    		if ("margin" in $$props) $$invalidate(4, margin = $$props.margin);
    		if ("opacity" in $$props) $$invalidate(5, opacity = $$props.opacity);
    		if ("label" in $$props) $$invalidate(6, label = $$props.label);
    		if ("underline" in $$props) $$invalidate(7, underline = $$props.underline);
    		if ("dotted" in $$props) $$invalidate(8, dotted = $$props.dotted);
    		if ("rotate" in $$props) $$invalidate(9, rotate = $$props.rotate);
    		if ("duration" in $$props) $$invalidate(14, duration = $$props.duration);
    		if ("start" in $$props) $$invalidate(12, start = $$props.start);
    		if ("date" in $$props) $$invalidate(15, date = $$props.date);
    		if ("end" in $$props) $$invalidate(13, end = $$props.end);
    		if ("top" in $$props) $$invalidate(10, top = $$props.top);
    		if ("bottom" in $$props) $$invalidate(16, bottom = $$props.bottom);
    		if ("height" in $$props) $$invalidate(11, height = $$props.height);
    	};

    	let top;
    	let bottom;
    	let height;

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*start*/ 4096) {
    			 $$invalidate(10, top = myScale(start));
    		}

    		if ($$self.$$.dirty & /*end*/ 8192) {
    			 $$invalidate(16, bottom = myScale(end));
    		}

    		if ($$self.$$.dirty & /*bottom, top*/ 66560) {
    			 $$invalidate(11, height = bottom - top);
    		}
    	};

    	return [
    		color,
    		width,
    		hide,
    		title,
    		margin,
    		opacity,
    		label,
    		underline,
    		dotted,
    		rotate,
    		top,
    		height,
    		start,
    		end,
    		duration,
    		date
    	];
    }

    class Line extends SvelteComponentDev$1 {
    	constructor(options) {
    		super(options);
    		if (!document.getElementById("svelte-6j65ft-style")) add_css$8();

    		init$1(this, options, instance$9, create_fragment$9, safe_not_equal$1, {
    			color: 0,
    			width: 1,
    			hide: 2,
    			title: 3,
    			margin: 4,
    			opacity: 5,
    			label: 6,
    			underline: 7,
    			dotted: 8,
    			rotate: 9,
    			duration: 14,
    			start: 12,
    			date: 15,
    			end: 13
    		});

    		dispatch_dev$1("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Line",
    			options,
    			id: create_fragment$9.name
    		});
    	}

    	get color() {
    		throw new Error("<Line>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set color(value) {
    		throw new Error("<Line>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get width() {
    		throw new Error("<Line>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set width(value) {
    		throw new Error("<Line>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get hide() {
    		throw new Error("<Line>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set hide(value) {
    		throw new Error("<Line>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get title() {
    		throw new Error("<Line>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set title(value) {
    		throw new Error("<Line>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get margin() {
    		throw new Error("<Line>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set margin(value) {
    		throw new Error("<Line>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get opacity() {
    		throw new Error("<Line>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set opacity(value) {
    		throw new Error("<Line>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get label() {
    		throw new Error("<Line>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set label(value) {
    		throw new Error("<Line>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get underline() {
    		throw new Error("<Line>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set underline(value) {
    		throw new Error("<Line>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get dotted() {
    		throw new Error("<Line>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set dotted(value) {
    		throw new Error("<Line>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get rotate() {
    		throw new Error("<Line>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set rotate(value) {
    		throw new Error("<Line>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get duration() {
    		throw new Error("<Line>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set duration(value) {
    		throw new Error("<Line>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get start() {
    		throw new Error("<Line>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set start(value) {
    		throw new Error("<Line>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get date() {
    		throw new Error("<Line>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set date(value) {
    		throw new Error("<Line>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get end() {
    		throw new Error("<Line>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set end(value) {
    		throw new Error("<Line>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* 2020/daylight-savings-changes/Post.svelte generated by Svelte v3.29.0 */

    const file$a = "2020/daylight-savings-changes/Post.svelte";

    function add_css$9() {
    	var style = element("style");
    	style.id = "svelte-1munrgk-style";
    	style.textContent = ".m3.svelte-1munrgk{margin:3rem}.grey.svelte-1munrgk{color:#d1d1d1}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUG9zdC5zdmVsdGUiLCJzb3VyY2VzIjpbIlBvc3Quc3ZlbHRlIl0sInNvdXJjZXNDb250ZW50IjpbIjxzY3JpcHQ+XG4gIGltcG9ydCB7IFBhZ2UgfSBmcm9tICcuLi8uLi9jb21wb25lbnRzL2luZGV4Lm1qcydcbiAgaW1wb3J0IHNwYWNldGltZSBmcm9tICdzcGFjZXRpbWUnXG4gIGltcG9ydCBjb2xvcnMgZnJvbSAnc3BlbmNlci1jb2xvcidcbiAgZXhwb3J0IGxldCB0aXRsZSA9ICdEYXlsaWdodCBTYXZpbmdzIGNoYW5nZSBkYXRlcywgaW4gMjAyMCdcbiAgZXhwb3J0IGxldCBzdWIgPSBcIidFYXN0ZXJuIFN0YW5kYXJkJyB0aW1lXCJcbiAgaW1wb3J0IGRhdGEgZnJvbSAnLi9kYXRhJ1xuICBpbXBvcnQge1xuICAgIFRpbWVsaW5lLFxuICAgIFRpY2tzLFxuICAgIExpbmUsXG4gICAgV2lkZUxhYmVsLFxuICAgIE5vdyxcbiAgICBDb2x1bW4sXG4gICAgLy8gY29sb3JzLFxuICB9IGZyb20gJy9Vc2Vycy9zcGVuY2VyL21vdW50YWluL3NvbWVob3ctdGltZWxpbmUvc3JjJ1xuICBsZXQgeWVhciA9IG5ldyBEYXRlKCkuZ2V0RnVsbFllYXIoKVxuICBsZXQgc3RhcnQgPSAnSmFuIDEgJ1xuICBsZXQgZW5kID0gJ0RlYyAzMSAnXG4gIGxldCBoZWlnaHQgPSA5MDBcbiAgbGV0IHpvbmVzID0gZGF0YS5tYXAoKHpvbmUsIGkpID0+IHtcbiAgICB6b25lLmNvbG9yID0gY29sb3JzLmNvbWJvcy5yb21hW2kgJSA2XVxuICAgIHpvbmUudGltZXMuZm9yRWFjaCgobykgPT4ge1xuICAgICAgbGV0IGEgPSBvLnN0YXJ0LnNwbGl0KC9cXC8vKVxuICAgICAgbGV0IHMgPSBzcGFjZXRpbWUoeyBtb250aDogTnVtYmVyKGFbMF0pLCBkYXRlOiBhWzFdLCB5ZWFyOiB5ZWFyIH0pXG4gICAgICBvLnN0YXJ0ID0gcy5mb3JtYXQoJ2lzbycpXG5cbiAgICAgIGEgPSBvLmVuZC5zcGxpdCgvXFwvLylcbiAgICAgIHMgPSBzcGFjZXRpbWUoeyBtb250aDogTnVtYmVyKGFbMF0pLCBkYXRlOiBhWzFdLCB5ZWFyOiB5ZWFyIH0pXG4gICAgICBvLmVuZCA9IHMuZm9ybWF0KCdpc28nKVxuICAgIH0pXG4gICAgcmV0dXJuIHpvbmVcbiAgfSlcbiAgem9uZXMgPSB6b25lcy5zb3J0KChhLCBiKSA9PiB7XG4gICAgaWYgKGEub2Zmc2V0ID4gYi5vZmZzZXQpIHtcbiAgICAgIHJldHVybiAtMVxuICAgIH0gZWxzZSBpZiAoYS5vZmZzZXQgPCBiLm9mZnNldCkge1xuICAgICAgcmV0dXJuIDFcbiAgICB9XG4gICAgcmV0dXJuIDBcbiAgfSlcblxuICAvLyBjb25zb2xlLmxvZyh6b25lcylcbiAgbGV0IHBvc2l0aXZlcyA9IFtdXG4gIGxldCBuZWdhdGl2ZXMgPSBbXVxuICB6b25lcy5mb3JFYWNoKCh6KSA9PiB7XG4gICAgaWYgKHoub2Zmc2V0IDwgMCkge1xuICAgICAgbmVnYXRpdmVzLnB1c2goeilcbiAgICB9IGVsc2Uge1xuICAgICAgcG9zaXRpdmVzLnB1c2goeilcbiAgICB9XG4gIH0pXG4gIC8vIGFkZCBhbHJlYWR5XG4gIHBvc2l0aXZlcy5yZXZlcnNlKClcbiAgbGV0IGFscmVhZHkgPSAwXG4gIHBvc2l0aXZlcy5mb3JFYWNoKCh6KSA9PiB7XG4gICAgei5hbHJlYWR5ID0gYWxyZWFkeVxuICAgIHoudGltZXMuZm9yRWFjaCgodCkgPT4ge1xuICAgICAgYWxyZWFkeSArPSB0LnpvbmVzLmxlbmd0aFxuICAgIH0pXG4gIH0pXG4gIGFscmVhZHkgPSAwXG4gIG5lZ2F0aXZlcy5mb3JFYWNoKCh6KSA9PiB7XG4gICAgei5hbHJlYWR5ID0gYWxyZWFkeVxuICAgIHoudGltZXMuZm9yRWFjaCgodCkgPT4ge1xuICAgICAgYWxyZWFkeSArPSB0LnpvbmVzLmxlbmd0aFxuICAgIH0pXG4gIH0pXG4gIC8vIG5lZ2F0aXZlcy5yZXZlcnNlKClcbjwvc2NyaXB0PlxuXG48UGFnZSB7dGl0bGV9IHtzdWJ9PlxuICA8ZGl2PlxuICAgIDxkaXY+V2VzdGVybiBIZW1pc3BoZXJlPC9kaXY+XG4gICAgPGRpdiBjbGFzcz1cImdyZXlcIj4oTm9ydGgvU291dGggQW1lcmljYSk8L2Rpdj5cbiAgICA8VGltZWxpbmUge3N0YXJ0fSB7ZW5kfSB7aGVpZ2h0fT5cbiAgICAgIDxUaWNrcyBldmVyeT1cIm1vbnRoXCIgLz5cbiAgICAgIDxOb3cgbGFiZWw9XCJ0b2RheVwiIGNvbG9yPVwicGlua1wiIC8+XG4gICAgICA8V2lkZUxhYmVsXG4gICAgICAgIGxlZnQ9eycxMDBweCd9XG4gICAgICAgIHdpZHRoPVwiNTBweFwiXG4gICAgICAgIGxhYmVsPXsnQXRsYW50aWMnfVxuICAgICAgICBjb2xvcj1cInJnYigyMTQsIDEzNiwgMTI5KVwiXG4gICAgICAgIGRhdGU9eydmZWIgMjAgJyArIHllYXJ9XG4gICAgICAvPlxuICAgICAgPFdpZGVMYWJlbFxuICAgICAgICBsZWZ0PXsnMjUwcHgnfVxuICAgICAgICB3aWR0aD1cIjUwcHhcIlxuICAgICAgICBsYWJlbD17J0Vhc3Rlcm4nfVxuICAgICAgICBjb2xvcj1cInJnYigxMzksIDE2MywgMTYyKVwiXG4gICAgICAgIGRhdGU9eydmZWIgMjAgJyArIHllYXJ9XG4gICAgICAvPlxuICAgICAgPFdpZGVMYWJlbFxuICAgICAgICBsZWZ0PXsnNTIwcHgnfVxuICAgICAgICB3aWR0aD1cIjE1MHB4XCJcbiAgICAgICAgbGFiZWw9eydDZW50cmFsJ31cbiAgICAgICAgY29sb3I9XCJyZ2IoMTk2LCAxNzEsIDE3MSlcIlxuICAgICAgICBkYXRlPXsnZmViIDIwICcgKyB5ZWFyfVxuICAgICAgLz5cbiAgICAgIDxXaWRlTGFiZWxcbiAgICAgICAgbGVmdD17Jzc1MHB4J31cbiAgICAgICAgd2lkdGg9XCI3MHB4XCJcbiAgICAgICAgbGFiZWw9eydNb3VudGFpbid9XG4gICAgICAgIGNvbG9yPVwicmdiKDEzOCwgMTMyLCAxNTQpXCJcbiAgICAgICAgZGF0ZT17J2ZlYiAyMCAnICsgeWVhcn1cbiAgICAgIC8+XG4gICAgICA8V2lkZUxhYmVsXG4gICAgICAgIGxlZnQ9eyc5NDBweCd9XG4gICAgICAgIHdpZHRoPVwiMzBweFwiXG4gICAgICAgIGxhYmVsPXsnUGFjaWZpYyd9XG4gICAgICAgIGNvbG9yPVwicmdiKDE4MSwgMTc2LCAxOTEpXCJcbiAgICAgICAgZGF0ZT17J2ZlYiAyMCAnICsgeWVhcn1cbiAgICAgIC8+XG5cbiAgICAgIHsjZWFjaCBuZWdhdGl2ZXMgYXMgem9uZSwgaX1cbiAgICAgICAgeyNpZiAhU3RyaW5nKHpvbmUub2Zmc2V0KS5tYXRjaCgvXFwuLyl9XG4gICAgICAgICAgPFdpZGVMYWJlbFxuICAgICAgICAgICAgbGVmdD17NTAgKyB6b25lLmFscmVhZHkgKiAxMyArICdweCd9XG4gICAgICAgICAgICB3aWR0aD1cIjMwcHhcIlxuICAgICAgICAgICAgY29sb3I9e3pvbmUuY29sb3J9XG4gICAgICAgICAgICBsYWJlbD17em9uZS5vZmZzZXQgKyAnaCd9XG4gICAgICAgICAgICBvcGFjaXR5PVwiMC41XCJcbiAgICAgICAgICAgIGRhdGU9eydtYXJjaCA3ICcgKyB5ZWFyfVxuICAgICAgICAgIC8+XG4gICAgICAgIHsvaWZ9XG4gICAgICAgIHsjZWFjaCB6b25lLnRpbWVzIGFzIHRpbWV9XG4gICAgICAgICAgeyNlYWNoIHRpbWUuem9uZXMgYXMgbmFtZX1cbiAgICAgICAgICAgIDxDb2x1bW4gd2lkdGg9XCI4cHhcIiBtYXJnaW49XCIwcHhcIj5cbiAgICAgICAgICAgICAgPExpbmUgc3RhcnQ9e3RpbWUuc3RhcnR9IGVuZD17dGltZS5lbmR9IHRpdGxlPXtuYW1lfSBjb2xvcj17em9uZS5jb2xvcn0gLz5cbiAgICAgICAgICAgIDwvQ29sdW1uPlxuICAgICAgICAgIHsvZWFjaH1cbiAgICAgICAgey9lYWNofVxuICAgICAgey9lYWNofVxuICAgIDwvVGltZWxpbmU+XG4gIDwvZGl2PlxuXG4gIDxkaXYgY2xhc3M9XCJtM1wiPlxuICAgIDxkaXY+RWFzdGVybiBIZW1pc3BoZXJlPC9kaXY+XG4gICAgPGRpdiBjbGFzcz1cImdyZXlcIj4oQXNpYS9BZnJpY2EpPC9kaXY+XG4gICAgPFRpbWVsaW5lIHtzdGFydH0ge2VuZH0ge2hlaWdodH0+XG4gICAgICA8VGlja3MgZXZlcnk9XCJtb250aFwiIC8+XG4gICAgICA8Tm93IGxhYmVsPVwidG9kYXlcIiBjb2xvcj1cInBpbmtcIiAvPlxuICAgICAgPFdpZGVMYWJlbFxuICAgICAgICBsZWZ0PXsnMTUwcHgnfVxuICAgICAgICB3aWR0aD1cIjYwcHhcIlxuICAgICAgICBsYWJlbD17J0dNVCd9XG4gICAgICAgIGNvbG9yPVwicmdiKDEzOSwgMTYzLCAxNjIpXCJcbiAgICAgICAgZGF0ZT17J21hcmNoIDIwICcgKyB5ZWFyfVxuICAgICAgLz5cbiAgICAgIDxXaWRlTGFiZWxcbiAgICAgICAgbGVmdD17JzI1MHB4J31cbiAgICAgICAgd2lkdGg9XCIxNjBweFwiXG4gICAgICAgIGxhYmVsPXsnQ0VUJ31cbiAgICAgICAgY29sb3I9XCJyZ2IoMjE0LCAxMzYsIDEyOSlcIlxuICAgICAgICBkYXRlPXsnbWFyY2ggMjAgJyArIHllYXJ9XG4gICAgICAvPlxuICAgICAgPFdpZGVMYWJlbFxuICAgICAgICBsZWZ0PXsnNTUwcHgnfVxuICAgICAgICB3aWR0aD1cIjkwcHhcIlxuICAgICAgICBsYWJlbD17J0VFVCd9XG4gICAgICAgIGNvbG9yPVwicmdiKDIxNSwgMjEzLCAyMTApXCJcbiAgICAgICAgZGF0ZT17J21hcmNoIDIwICcgKyB5ZWFyfVxuICAgICAgLz5cbiAgICAgIHsjZWFjaCBwb3NpdGl2ZXMgYXMgem9uZSwgaX1cbiAgICAgICAgeyNpZiAhU3RyaW5nKHpvbmUub2Zmc2V0KS5tYXRjaCgvXFwuLyl9XG4gICAgICAgICAgPFdpZGVMYWJlbFxuICAgICAgICAgICAgbGVmdD17NTAgKyB6b25lLmFscmVhZHkgKiAxMCArICdweCd9XG4gICAgICAgICAgICB3aWR0aD1cIjMwcHhcIlxuICAgICAgICAgICAgY29sb3I9e3pvbmUuY29sb3J9XG4gICAgICAgICAgICBsYWJlbD17em9uZS5vZmZzZXQgKyAnaCd9XG4gICAgICAgICAgICBkYXRlPXsnYXByaWwgMTAgJyArIHllYXJ9XG4gICAgICAgICAgLz5cbiAgICAgICAgey9pZn1cbiAgICAgICAgeyNlYWNoIHpvbmUudGltZXMgYXMgdGltZX1cbiAgICAgICAgICB7I2VhY2ggdGltZS56b25lcyBhcyBuYW1lfVxuICAgICAgICAgICAgPENvbHVtbiB3aWR0aD1cIjZweFwiIG1hcmdpbj1cIjJweFwiPlxuICAgICAgICAgICAgICA8TGluZSBzdGFydD17dGltZS5zdGFydH0gZW5kPXt0aW1lLmVuZH0gdGl0bGU9e25hbWV9IGNvbG9yPXt6b25lLmNvbG9yfSAvPlxuICAgICAgICAgICAgPC9Db2x1bW4+XG4gICAgICAgICAgey9lYWNofVxuICAgICAgICB7L2VhY2h9XG4gICAgICB7L2VhY2h9XG4gICAgPC9UaW1lbGluZT5cbiAgPC9kaXY+PC9QYWdlXG4+XG5cbjxzdHlsZT5cbiAgLm0zIHtcbiAgICBtYXJnaW46IDNyZW07XG4gIH1cbiAgLmdyZXkge1xuICAgIGNvbG9yOiAjZDFkMWQxO1xuICB9XG48L3N0eWxlPlxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQTBMRSxHQUFHLGVBQUMsQ0FBQyxBQUNILE1BQU0sQ0FBRSxJQUFJLEFBQ2QsQ0FBQyxBQUNELEtBQUssZUFBQyxDQUFDLEFBQ0wsS0FBSyxDQUFFLE9BQU8sQUFDaEIsQ0FBQyJ9 */";
    	append_dev(document.head, style);
    }

    function get_each_context_2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[16] = list[i];
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[13] = list[i];
    	return child_ctx;
    }

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[10] = list[i];
    	child_ctx[12] = i;
    	return child_ctx;
    }

    function get_each_context_5(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[16] = list[i];
    	return child_ctx;
    }

    function get_each_context_4(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[13] = list[i];
    	return child_ctx;
    }

    function get_each_context_3(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[10] = list[i];
    	child_ctx[12] = i;
    	return child_ctx;
    }

    // (116:8) {#if !String(zone.offset).match(/\./)}
    function create_if_block_1$1(ctx) {
    	let widelabel;
    	let current;

    	widelabel = new WideLabel({
    			props: {
    				left: 50 + /*zone*/ ctx[10].already * 13 + "px",
    				width: "30px",
    				color: /*zone*/ ctx[10].color,
    				label: /*zone*/ ctx[10].offset + "h",
    				opacity: "0.5",
    				date: "march 7 " + /*year*/ ctx[2]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(widelabel.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(widelabel, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(widelabel.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(widelabel.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(widelabel, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$1.name,
    		type: "if",
    		source: "(116:8) {#if !String(zone.offset).match(/\\./)}",
    		ctx
    	});

    	return block;
    }

    // (128:12) <Column width="8px" margin="0px">
    function create_default_slot_4(ctx) {
    	let line;
    	let t;
    	let current;

    	line = new Line({
    			props: {
    				start: /*time*/ ctx[13].start,
    				end: /*time*/ ctx[13].end,
    				title: /*name*/ ctx[16],
    				color: /*zone*/ ctx[10].color
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(line.$$.fragment);
    			t = space();
    		},
    		m: function mount(target, anchor) {
    			mount_component(line, target, anchor);
    			insert_dev(target, t, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(line.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(line.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(line, detaching);
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_4.name,
    		type: "slot",
    		source: "(128:12) <Column width=\\\"8px\\\" margin=\\\"0px\\\">",
    		ctx
    	});

    	return block;
    }

    // (127:10) {#each time.zones as name}
    function create_each_block_5(ctx) {
    	let column;
    	let current;

    	column = new Column({
    			props: {
    				width: "8px",
    				margin: "0px",
    				$$slots: { default: [create_default_slot_4] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(column.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(column, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const column_changes = {};

    			if (dirty & /*$$scope*/ 16777216) {
    				column_changes.$$scope = { dirty, ctx };
    			}

    			column.$set(column_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(column.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(column.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(column, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_5.name,
    		type: "each",
    		source: "(127:10) {#each time.zones as name}",
    		ctx
    	});

    	return block;
    }

    // (126:8) {#each zone.times as time}
    function create_each_block_4(ctx) {
    	let each_1_anchor;
    	let current;
    	let each_value_5 = /*time*/ ctx[13].zones;
    	validate_each_argument(each_value_5);
    	let each_blocks = [];

    	for (let i = 0; i < each_value_5.length; i += 1) {
    		each_blocks[i] = create_each_block_5(get_each_context_5(ctx, each_value_5, i));
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
    			if (dirty & /*negatives*/ 128) {
    				each_value_5 = /*time*/ ctx[13].zones;
    				validate_each_argument(each_value_5);
    				let i;

    				for (i = 0; i < each_value_5.length; i += 1) {
    					const child_ctx = get_each_context_5(ctx, each_value_5, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block_5(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				group_outros();

    				for (i = each_value_5.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value_5.length; i += 1) {
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
    		id: create_each_block_4.name,
    		type: "each",
    		source: "(126:8) {#each zone.times as time}",
    		ctx
    	});

    	return block;
    }

    // (115:6) {#each negatives as zone, i}
    function create_each_block_3(ctx) {
    	let show_if = !String(/*zone*/ ctx[10].offset).match(/\./);
    	let t;
    	let each_1_anchor;
    	let current;
    	let if_block = show_if && create_if_block_1$1(ctx);
    	let each_value_4 = /*zone*/ ctx[10].times;
    	validate_each_argument(each_value_4);
    	let each_blocks = [];

    	for (let i = 0; i < each_value_4.length; i += 1) {
    		each_blocks[i] = create_each_block_4(get_each_context_4(ctx, each_value_4, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			t = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, t, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_dev(target, each_1_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (show_if) if_block.p(ctx, dirty);

    			if (dirty & /*negatives*/ 128) {
    				each_value_4 = /*zone*/ ctx[10].times;
    				validate_each_argument(each_value_4);
    				let i;

    				for (i = 0; i < each_value_4.length; i += 1) {
    					const child_ctx = get_each_context_4(ctx, each_value_4, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block_4(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				group_outros();

    				for (i = each_value_4.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);

    			for (let i = 0; i < each_value_4.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(t);
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach_dev(each_1_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_3.name,
    		type: "each",
    		source: "(115:6) {#each negatives as zone, i}",
    		ctx
    	});

    	return block;
    }

    // (76:4) <Timeline {start} {end} {height}>
    function create_default_slot_3(ctx) {
    	let ticks;
    	let t0;
    	let now_1;
    	let t1;
    	let widelabel0;
    	let t2;
    	let widelabel1;
    	let t3;
    	let widelabel2;
    	let t4;
    	let widelabel3;
    	let t5;
    	let widelabel4;
    	let t6;
    	let each_1_anchor;
    	let current;

    	ticks = new Ticks({
    			props: { every: "month" },
    			$$inline: true
    		});

    	now_1 = new Now({
    			props: { label: "today", color: "pink" },
    			$$inline: true
    		});

    	widelabel0 = new WideLabel({
    			props: {
    				left: "100px",
    				width: "50px",
    				label: "Atlantic",
    				color: "rgb(214, 136, 129)",
    				date: "feb 20 " + /*year*/ ctx[2]
    			},
    			$$inline: true
    		});

    	widelabel1 = new WideLabel({
    			props: {
    				left: "250px",
    				width: "50px",
    				label: "Eastern",
    				color: "rgb(139, 163, 162)",
    				date: "feb 20 " + /*year*/ ctx[2]
    			},
    			$$inline: true
    		});

    	widelabel2 = new WideLabel({
    			props: {
    				left: "520px",
    				width: "150px",
    				label: "Central",
    				color: "rgb(196, 171, 171)",
    				date: "feb 20 " + /*year*/ ctx[2]
    			},
    			$$inline: true
    		});

    	widelabel3 = new WideLabel({
    			props: {
    				left: "750px",
    				width: "70px",
    				label: "Mountain",
    				color: "rgb(138, 132, 154)",
    				date: "feb 20 " + /*year*/ ctx[2]
    			},
    			$$inline: true
    		});

    	widelabel4 = new WideLabel({
    			props: {
    				left: "940px",
    				width: "30px",
    				label: "Pacific",
    				color: "rgb(181, 176, 191)",
    				date: "feb 20 " + /*year*/ ctx[2]
    			},
    			$$inline: true
    		});

    	let each_value_3 = /*negatives*/ ctx[7];
    	validate_each_argument(each_value_3);
    	let each_blocks = [];

    	for (let i = 0; i < each_value_3.length; i += 1) {
    		each_blocks[i] = create_each_block_3(get_each_context_3(ctx, each_value_3, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	const block = {
    		c: function create() {
    			create_component(ticks.$$.fragment);
    			t0 = space();
    			create_component(now_1.$$.fragment);
    			t1 = space();
    			create_component(widelabel0.$$.fragment);
    			t2 = space();
    			create_component(widelabel1.$$.fragment);
    			t3 = space();
    			create_component(widelabel2.$$.fragment);
    			t4 = space();
    			create_component(widelabel3.$$.fragment);
    			t5 = space();
    			create_component(widelabel4.$$.fragment);
    			t6 = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			mount_component(ticks, target, anchor);
    			insert_dev(target, t0, anchor);
    			mount_component(now_1, target, anchor);
    			insert_dev(target, t1, anchor);
    			mount_component(widelabel0, target, anchor);
    			insert_dev(target, t2, anchor);
    			mount_component(widelabel1, target, anchor);
    			insert_dev(target, t3, anchor);
    			mount_component(widelabel2, target, anchor);
    			insert_dev(target, t4, anchor);
    			mount_component(widelabel3, target, anchor);
    			insert_dev(target, t5, anchor);
    			mount_component(widelabel4, target, anchor);
    			insert_dev(target, t6, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_dev(target, each_1_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*negatives, year, String*/ 132) {
    				each_value_3 = /*negatives*/ ctx[7];
    				validate_each_argument(each_value_3);
    				let i;

    				for (i = 0; i < each_value_3.length; i += 1) {
    					const child_ctx = get_each_context_3(ctx, each_value_3, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block_3(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				group_outros();

    				for (i = each_value_3.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(ticks.$$.fragment, local);
    			transition_in(now_1.$$.fragment, local);
    			transition_in(widelabel0.$$.fragment, local);
    			transition_in(widelabel1.$$.fragment, local);
    			transition_in(widelabel2.$$.fragment, local);
    			transition_in(widelabel3.$$.fragment, local);
    			transition_in(widelabel4.$$.fragment, local);

    			for (let i = 0; i < each_value_3.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(ticks.$$.fragment, local);
    			transition_out(now_1.$$.fragment, local);
    			transition_out(widelabel0.$$.fragment, local);
    			transition_out(widelabel1.$$.fragment, local);
    			transition_out(widelabel2.$$.fragment, local);
    			transition_out(widelabel3.$$.fragment, local);
    			transition_out(widelabel4.$$.fragment, local);
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(ticks, detaching);
    			if (detaching) detach_dev(t0);
    			destroy_component(now_1, detaching);
    			if (detaching) detach_dev(t1);
    			destroy_component(widelabel0, detaching);
    			if (detaching) detach_dev(t2);
    			destroy_component(widelabel1, detaching);
    			if (detaching) detach_dev(t3);
    			destroy_component(widelabel2, detaching);
    			if (detaching) detach_dev(t4);
    			destroy_component(widelabel3, detaching);
    			if (detaching) detach_dev(t5);
    			destroy_component(widelabel4, detaching);
    			if (detaching) detach_dev(t6);
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach_dev(each_1_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_3.name,
    		type: "slot",
    		source: "(76:4) <Timeline {start} {end} {height}>",
    		ctx
    	});

    	return block;
    }

    // (165:8) {#if !String(zone.offset).match(/\./)}
    function create_if_block$1(ctx) {
    	let widelabel;
    	let current;

    	widelabel = new WideLabel({
    			props: {
    				left: 50 + /*zone*/ ctx[10].already * 10 + "px",
    				width: "30px",
    				color: /*zone*/ ctx[10].color,
    				label: /*zone*/ ctx[10].offset + "h",
    				date: "april 10 " + /*year*/ ctx[2]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(widelabel.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(widelabel, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(widelabel.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(widelabel.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(widelabel, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(165:8) {#if !String(zone.offset).match(/\\./)}",
    		ctx
    	});

    	return block;
    }

    // (176:12) <Column width="6px" margin="2px">
    function create_default_slot_2(ctx) {
    	let line;
    	let t;
    	let current;

    	line = new Line({
    			props: {
    				start: /*time*/ ctx[13].start,
    				end: /*time*/ ctx[13].end,
    				title: /*name*/ ctx[16],
    				color: /*zone*/ ctx[10].color
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(line.$$.fragment);
    			t = space();
    		},
    		m: function mount(target, anchor) {
    			mount_component(line, target, anchor);
    			insert_dev(target, t, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(line.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(line.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(line, detaching);
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_2.name,
    		type: "slot",
    		source: "(176:12) <Column width=\\\"6px\\\" margin=\\\"2px\\\">",
    		ctx
    	});

    	return block;
    }

    // (175:10) {#each time.zones as name}
    function create_each_block_2(ctx) {
    	let column;
    	let current;

    	column = new Column({
    			props: {
    				width: "6px",
    				margin: "2px",
    				$$slots: { default: [create_default_slot_2] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(column.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(column, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const column_changes = {};

    			if (dirty & /*$$scope*/ 16777216) {
    				column_changes.$$scope = { dirty, ctx };
    			}

    			column.$set(column_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(column.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(column.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(column, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_2.name,
    		type: "each",
    		source: "(175:10) {#each time.zones as name}",
    		ctx
    	});

    	return block;
    }

    // (174:8) {#each zone.times as time}
    function create_each_block_1(ctx) {
    	let each_1_anchor;
    	let current;
    	let each_value_2 = /*time*/ ctx[13].zones;
    	validate_each_argument(each_value_2);
    	let each_blocks = [];

    	for (let i = 0; i < each_value_2.length; i += 1) {
    		each_blocks[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
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
    			if (dirty & /*positives*/ 64) {
    				each_value_2 = /*time*/ ctx[13].zones;
    				validate_each_argument(each_value_2);
    				let i;

    				for (i = 0; i < each_value_2.length; i += 1) {
    					const child_ctx = get_each_context_2(ctx, each_value_2, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block_2(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				group_outros();

    				for (i = each_value_2.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value_2.length; i += 1) {
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
    		id: create_each_block_1.name,
    		type: "each",
    		source: "(174:8) {#each zone.times as time}",
    		ctx
    	});

    	return block;
    }

    // (164:6) {#each positives as zone, i}
    function create_each_block$1(ctx) {
    	let show_if = !String(/*zone*/ ctx[10].offset).match(/\./);
    	let t;
    	let each_1_anchor;
    	let current;
    	let if_block = show_if && create_if_block$1(ctx);
    	let each_value_1 = /*zone*/ ctx[10].times;
    	validate_each_argument(each_value_1);
    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			t = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, t, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_dev(target, each_1_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (show_if) if_block.p(ctx, dirty);

    			if (dirty & /*positives*/ 64) {
    				each_value_1 = /*zone*/ ctx[10].times;
    				validate_each_argument(each_value_1);
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block_1(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				group_outros();

    				for (i = each_value_1.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);

    			for (let i = 0; i < each_value_1.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(t);
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach_dev(each_1_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$1.name,
    		type: "each",
    		source: "(164:6) {#each positives as zone, i}",
    		ctx
    	});

    	return block;
    }

    // (140:4) <Timeline {start} {end} {height}>
    function create_default_slot_1(ctx) {
    	let ticks;
    	let t0;
    	let now_1;
    	let t1;
    	let widelabel0;
    	let t2;
    	let widelabel1;
    	let t3;
    	let widelabel2;
    	let t4;
    	let each_1_anchor;
    	let current;

    	ticks = new Ticks({
    			props: { every: "month" },
    			$$inline: true
    		});

    	now_1 = new Now({
    			props: { label: "today", color: "pink" },
    			$$inline: true
    		});

    	widelabel0 = new WideLabel({
    			props: {
    				left: "150px",
    				width: "60px",
    				label: "GMT",
    				color: "rgb(139, 163, 162)",
    				date: "march 20 " + /*year*/ ctx[2]
    			},
    			$$inline: true
    		});

    	widelabel1 = new WideLabel({
    			props: {
    				left: "250px",
    				width: "160px",
    				label: "CET",
    				color: "rgb(214, 136, 129)",
    				date: "march 20 " + /*year*/ ctx[2]
    			},
    			$$inline: true
    		});

    	widelabel2 = new WideLabel({
    			props: {
    				left: "550px",
    				width: "90px",
    				label: "EET",
    				color: "rgb(215, 213, 210)",
    				date: "march 20 " + /*year*/ ctx[2]
    			},
    			$$inline: true
    		});

    	let each_value = /*positives*/ ctx[6];
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
    			create_component(ticks.$$.fragment);
    			t0 = space();
    			create_component(now_1.$$.fragment);
    			t1 = space();
    			create_component(widelabel0.$$.fragment);
    			t2 = space();
    			create_component(widelabel1.$$.fragment);
    			t3 = space();
    			create_component(widelabel2.$$.fragment);
    			t4 = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			mount_component(ticks, target, anchor);
    			insert_dev(target, t0, anchor);
    			mount_component(now_1, target, anchor);
    			insert_dev(target, t1, anchor);
    			mount_component(widelabel0, target, anchor);
    			insert_dev(target, t2, anchor);
    			mount_component(widelabel1, target, anchor);
    			insert_dev(target, t3, anchor);
    			mount_component(widelabel2, target, anchor);
    			insert_dev(target, t4, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_dev(target, each_1_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*positives, year, String*/ 68) {
    				each_value = /*positives*/ ctx[6];
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
    			transition_in(ticks.$$.fragment, local);
    			transition_in(now_1.$$.fragment, local);
    			transition_in(widelabel0.$$.fragment, local);
    			transition_in(widelabel1.$$.fragment, local);
    			transition_in(widelabel2.$$.fragment, local);

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(ticks.$$.fragment, local);
    			transition_out(now_1.$$.fragment, local);
    			transition_out(widelabel0.$$.fragment, local);
    			transition_out(widelabel1.$$.fragment, local);
    			transition_out(widelabel2.$$.fragment, local);
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(ticks, detaching);
    			if (detaching) detach_dev(t0);
    			destroy_component(now_1, detaching);
    			if (detaching) detach_dev(t1);
    			destroy_component(widelabel0, detaching);
    			if (detaching) detach_dev(t2);
    			destroy_component(widelabel1, detaching);
    			if (detaching) detach_dev(t3);
    			destroy_component(widelabel2, detaching);
    			if (detaching) detach_dev(t4);
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach_dev(each_1_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_1.name,
    		type: "slot",
    		source: "(140:4) <Timeline {start} {end} {height}>",
    		ctx
    	});

    	return block;
    }

    // (72:0) <Page {title} {sub}>
    function create_default_slot(ctx) {
    	let div2;
    	let div0;
    	let t1;
    	let div1;
    	let t3;
    	let timeline0;
    	let t4;
    	let div5;
    	let div3;
    	let t6;
    	let div4;
    	let t8;
    	let timeline1;
    	let current;

    	timeline0 = new Timeline({
    			props: {
    				start: /*start*/ ctx[3],
    				end: /*end*/ ctx[4],
    				height: /*height*/ ctx[5],
    				$$slots: { default: [create_default_slot_3] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	timeline1 = new Timeline({
    			props: {
    				start: /*start*/ ctx[3],
    				end: /*end*/ ctx[4],
    				height: /*height*/ ctx[5],
    				$$slots: { default: [create_default_slot_1] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			div2 = element("div");
    			div0 = element("div");
    			div0.textContent = "Western Hemisphere";
    			t1 = space();
    			div1 = element("div");
    			div1.textContent = "(North/South America)";
    			t3 = space();
    			create_component(timeline0.$$.fragment);
    			t4 = space();
    			div5 = element("div");
    			div3 = element("div");
    			div3.textContent = "Eastern Hemisphere";
    			t6 = space();
    			div4 = element("div");
    			div4.textContent = "(Asia/Africa)";
    			t8 = space();
    			create_component(timeline1.$$.fragment);
    			add_location(div0, file$a, 73, 4, 1669);
    			attr_dev(div1, "class", "grey svelte-1munrgk");
    			add_location(div1, file$a, 74, 4, 1703);
    			add_location(div2, file$a, 72, 2, 1659);
    			add_location(div3, file$a, 137, 4, 3339);
    			attr_dev(div4, "class", "grey svelte-1munrgk");
    			add_location(div4, file$a, 138, 4, 3373);
    			attr_dev(div5, "class", "m3 svelte-1munrgk");
    			add_location(div5, file$a, 136, 2, 3318);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div2, anchor);
    			append_dev(div2, div0);
    			append_dev(div2, t1);
    			append_dev(div2, div1);
    			append_dev(div2, t3);
    			mount_component(timeline0, div2, null);
    			insert_dev(target, t4, anchor);
    			insert_dev(target, div5, anchor);
    			append_dev(div5, div3);
    			append_dev(div5, t6);
    			append_dev(div5, div4);
    			append_dev(div5, t8);
    			mount_component(timeline1, div5, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const timeline0_changes = {};

    			if (dirty & /*$$scope*/ 16777216) {
    				timeline0_changes.$$scope = { dirty, ctx };
    			}

    			timeline0.$set(timeline0_changes);
    			const timeline1_changes = {};

    			if (dirty & /*$$scope*/ 16777216) {
    				timeline1_changes.$$scope = { dirty, ctx };
    			}

    			timeline1.$set(timeline1_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(timeline0.$$.fragment, local);
    			transition_in(timeline1.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(timeline0.$$.fragment, local);
    			transition_out(timeline1.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div2);
    			destroy_component(timeline0);
    			if (detaching) detach_dev(t4);
    			if (detaching) detach_dev(div5);
    			destroy_component(timeline1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot.name,
    		type: "slot",
    		source: "(72:0) <Page {title} {sub}>",
    		ctx
    	});

    	return block;
    }

    function create_fragment$a(ctx) {
    	let page;
    	let current;

    	page = new Page({
    			props: {
    				title: /*title*/ ctx[0],
    				sub: /*sub*/ ctx[1],
    				$$slots: { default: [create_default_slot] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(page.$$.fragment);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			mount_component(page, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const page_changes = {};
    			if (dirty & /*title*/ 1) page_changes.title = /*title*/ ctx[0];
    			if (dirty & /*sub*/ 2) page_changes.sub = /*sub*/ ctx[1];

    			if (dirty & /*$$scope*/ 16777216) {
    				page_changes.$$scope = { dirty, ctx };
    			}

    			page.$set(page_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(page.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(page.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(page, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$a.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$a($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Post", slots, []);
    	let { title = "Daylight Savings change dates, in 2020" } = $$props;
    	let { sub = "'Eastern Standard' time" } = $$props;
    	let year = new Date().getFullYear();
    	let start = "Jan 1 ";
    	let end = "Dec 31 ";
    	let height = 900;

    	let zones = data$1.map((zone, i) => {
    		zone.color = spencerColor.combos.roma[i % 6];

    		zone.times.forEach(o => {
    			let a = o.start.split(/\//);
    			let s = main$1({ month: Number(a[0]), date: a[1], year });
    			o.start = s.format("iso");
    			a = o.end.split(/\//);
    			s = main$1({ month: Number(a[0]), date: a[1], year });
    			o.end = s.format("iso");
    		});

    		return zone;
    	});

    	zones = zones.sort((a, b) => {
    		if (a.offset > b.offset) {
    			return -1;
    		} else if (a.offset < b.offset) {
    			return 1;
    		}

    		return 0;
    	});

    	// console.log(zones)
    	let positives = [];

    	let negatives = [];

    	zones.forEach(z => {
    		if (z.offset < 0) {
    			negatives.push(z);
    		} else {
    			positives.push(z);
    		}
    	});

    	// add already
    	positives.reverse();

    	let already = 0;

    	positives.forEach(z => {
    		z.already = already;

    		z.times.forEach(t => {
    			already += t.zones.length;
    		});
    	});

    	already = 0;

    	negatives.forEach(z => {
    		z.already = already;

    		z.times.forEach(t => {
    			already += t.zones.length;
    		});
    	});

    	const writable_props = ["title", "sub"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Post> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("title" in $$props) $$invalidate(0, title = $$props.title);
    		if ("sub" in $$props) $$invalidate(1, sub = $$props.sub);
    	};

    	$$self.$capture_state = () => ({
    		Page,
    		spacetime: main$1,
    		colors: spencerColor,
    		title,
    		sub,
    		data: data$1,
    		Timeline,
    		Ticks,
    		Line,
    		WideLabel,
    		Now,
    		Column,
    		year,
    		start,
    		end,
    		height,
    		zones,
    		positives,
    		negatives,
    		already
    	});

    	$$self.$inject_state = $$props => {
    		if ("title" in $$props) $$invalidate(0, title = $$props.title);
    		if ("sub" in $$props) $$invalidate(1, sub = $$props.sub);
    		if ("year" in $$props) $$invalidate(2, year = $$props.year);
    		if ("start" in $$props) $$invalidate(3, start = $$props.start);
    		if ("end" in $$props) $$invalidate(4, end = $$props.end);
    		if ("height" in $$props) $$invalidate(5, height = $$props.height);
    		if ("zones" in $$props) zones = $$props.zones;
    		if ("positives" in $$props) $$invalidate(6, positives = $$props.positives);
    		if ("negatives" in $$props) $$invalidate(7, negatives = $$props.negatives);
    		if ("already" in $$props) already = $$props.already;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [title, sub, year, start, end, height, positives, negatives];
    }

    class Post extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		if (!document.getElementById("svelte-1munrgk-style")) add_css$9();
    		init(this, options, instance$a, create_fragment$a, safe_not_equal, { title: 0, sub: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Post",
    			options,
    			id: create_fragment$a.name
    		});
    	}

    	get title() {
    		throw new Error("<Post>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set title(value) {
    		throw new Error("<Post>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get sub() {
    		throw new Error("<Post>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set sub(value) {
    		throw new Error("<Post>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    let name$1 = '';
    // wire-in query params
    const URLSearchParams = window.URLSearchParams;
    if (typeof URLSearchParams !== undefined) {
      const urlParams = new URLSearchParams(window.location.search);
      const myParam = urlParams.get('name');
      if (myParam) {
        name$1 = myParam;
      }
    }

    const app = new Post({
      target: document.body,
      props: {
        name: name$1,
      },
    });

    return app;

}());
