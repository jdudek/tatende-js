#include <stdlib.h>
#include <string.h>
#include <setjmp.h>
#include <stdarg.h>

enum JSType {
    TypeUndefined,
    TypeNumber,
    TypeString,
    TypeBoolean,
    TypeObject
};

typedef struct {
    char* cstring;
    unsigned int length;
} JSString;

typedef struct TJSValue {
    enum JSType type;
    union {
        int number;
        JSString string;
        char boolean;
        struct TJSObject* object;
    } as;
} JSValue;

typedef unsigned int JSStringHash;

typedef struct {
    JSString key;
    JSStringHash key_hash;
    JSValue value;
} JSProperty;

enum JSObjectClass {
    ClassObject,
    ClassFunction,
    ClassArray
};

typedef struct TJSObject {
    enum JSObjectClass class;
    JSProperty* properties;
    unsigned short properties_count;
    unsigned short properties_size;
    struct TJSObject* prototype;
    struct TJSValue primitive;
    char gc_mark;
} JSObject;

typedef struct {
    JSObject as_object;
    JSValue (*function)();
    JSObject* binding;
} JSFunctionObject;

#define JS_CALL_STACK_SIZE 8192
#define JS_EXCEPTION_STACK_SIZE 1024
#define JS_GC_THRESHOLD 65536
#define JS_GC_STACK_DEPTH 4096

#define JS_CALL_STACK_ITEM(i) (env->call_stack[env->call_stack_count - stack_count + (i)])
#define JS_CALL_STACK_PUSH(x) (env->call_stack[env->call_stack_count++] = (x))
#define JS_CALL_STACK_POP     (env->call_stack_count -= stack_count)

#define JS_IS_FUNCTION(x) (x.type == TypeObject && x.as.object && x.as.object->class == ClassFunction)

typedef struct {
    jmp_buf jmp;
    JSValue value;
} JSException;

typedef struct {
    JSValue global;
    JSValue call_stack[JS_CALL_STACK_SIZE];
    unsigned int call_stack_count;
    JSException exceptions[JS_EXCEPTION_STACK_SIZE];
    unsigned int exceptions_count;
    JSObject** objects;
    unsigned int objects_count;
    unsigned int objects_size;
    unsigned int gc_last_objects_count;
} JSEnv;

void js_throw(JSEnv* env, JSValue exception);
JSValue js_call_function(JSEnv* env, JSValue v, JSValue this, int stack_count);
JSValue js_call_method(JSEnv* env, JSValue object, JSValue key, int stack_count);
JSValue js_invoke_constructor(JSEnv* env, JSValue function, int stack_count);

void js_call_stack_push(JSEnv* env, JSValue value);
void js_call_stack_pop(JSEnv* env);
JSValue js_call_stack_pop_and_return(JSEnv* env, JSValue value);
void js_check_call_stack_overflow(JSEnv* env, int n);

static JSString string_from_cstring(char* cstring);
static char* string_to_cstring(JSString string);
static JSString string_char_at(JSString string, int index);
static int string_cmp(JSString s1, JSString s2);
static JSStringHash string_to_hash(JSString string);

static JSObject* object_new(JSObject* prototype);
static JSProperty* object_find_property(JSObject* object, JSString key);
static JSProperty* object_find_own_property(JSObject* object, JSString key);
static JSValue object_get_own_property(JSObject* object, JSString key);
static JSValue object_get_property(JSObject* object, JSString key);
static void object_set_property(JSObject* object, JSString key, JSValue value);

static JSFunctionObject* function_object_new(JSObject* prototype, JSValue (*function_ptr)(), JSObject* binding);

JSValue js_get_property(JSEnv* env, JSValue value, JSValue key);
JSValue js_set_property(JSEnv* env, JSValue object, JSValue key, JSValue value);
JSValue js_get_global(JSEnv* env, JSString key);

void js_gc_setup(JSEnv* env);
void js_gc_save_object(JSEnv* env, JSObject* object);
int js_gc_should_run(JSEnv* env);
void js_gc_run(JSEnv* env, ...);

// --- constructors for values ------------------------------------------------

JSValue js_new_number(int n) {
    JSValue v;
    v.type = TypeNumber;
    v.as.number = n;
    return v;
}

JSValue js_string_value_from_string(JSString string) {
    JSValue v;
    v.type = TypeString;
    v.as.string = string;
    return v;
}

JSValue js_string_value_from_cstring(char* cstring) {
    return js_string_value_from_string(string_from_cstring(cstring));
}

JSValue js_new_boolean(char i) {
    JSValue v;
    v.type = TypeBoolean;
    v.as.boolean = i;
    return v;
}

JSValue js_object_value_from_object(JSObject* object) {
    JSValue v;
    v.type = TypeObject;
    v.as.object = object;
    return v;
}


JSObject* js_construct_object(JSEnv* env) {
    JSObject* object = object_new(NULL);
    js_gc_save_object(env, object);
    object->prototype =
        js_get_property(env, js_get_global(env, string_from_cstring("Object")),
            js_string_value_from_cstring("prototype")).as.object;
    return object;
}

JSValue js_construct_object_value(JSEnv* env) {
    return js_object_value_from_object(js_construct_object(env));
}

JSFunctionObject* js_construct_function_object(JSEnv* env, JSValue (*function_ptr)(), JSObject* binding) {
    JSObject* function_object_prototype =
        js_get_property(env, js_get_global(env, string_from_cstring("Function")),
            js_string_value_from_cstring("prototype")).as.object;

    JSFunctionObject* function_object = function_object_new(function_object_prototype, function_ptr, binding);
    js_gc_save_object(env, (JSObject*) function_object);

    // every function has a prototype object for constructed instances
    JSObject* instances_prototype = js_construct_object(env);
    object_set_property(instances_prototype,
        string_from_cstring("constructor"),
        js_object_value_from_object((JSObject*) function_object));
    object_set_property((JSObject*) function_object,
        string_from_cstring("prototype"),
        js_object_value_from_object(instances_prototype));

    return function_object;
}

JSValue js_construct_function_object_value(JSEnv* env, JSValue (*function_ptr)(), JSObject* binding) {
    return js_object_value_from_object((JSObject*) js_construct_function_object(env, function_ptr, binding));
}

JSValue js_new_undefined() {
    JSValue v;
    v.type = TypeUndefined;
    return v;
}

JSValue js_new_null() {
    JSValue v;
    v.type = TypeObject;
    v.as.object = NULL;
    return v;
}

// --- conversions ------------------------------------------------------------

JSValue js_to_string(JSEnv* env, JSValue v) {
    switch (v.type) {
        case TypeNumber:;
            // TODO move to separate function
            char len = 1;
            int a = v.as.number;
            if (a < 0) { a = -a; len++; }
            do { len++; a = a / 10; } while (a > 0);
            char* s = malloc(sizeof(char) * len);
            snprintf(s, len, "%d", v.as.number);
            return js_string_value_from_cstring(s);
        case TypeString:
            return v;
        case TypeBoolean:
            if (v.as.boolean) {
                return js_string_value_from_cstring("true");
            } else {
                return js_string_value_from_cstring("false");
            }
        case TypeObject:;
            JSValue to_string = object_get_property(v.as.object, string_from_cstring("toString"));
            if (JS_IS_FUNCTION(to_string)) {
                return js_call_method(env, v, js_string_value_from_cstring("toString"), 0);
            } else if (v.as.object->class == ClassFunction) {
                return js_string_value_from_cstring("[function]");
            } else {
                return js_string_value_from_cstring("[object]");
            }
        case TypeUndefined:
            return js_string_value_from_cstring("[undefined]");
    }
}

JSValue js_to_number(JSEnv* env, JSValue v) {
    if (v.type == TypeNumber) {
        return v;
    } else if (v.type == TypeBoolean) {
        return js_new_number(v.as.boolean);
    } else {
        fprintf(stderr, "Cannot convert to number: %s\n", string_to_cstring(js_to_string(env, v).as.string));
        exit(1);
    }
}

JSValue js_to_boolean(JSValue v) {
    switch (v.type) {
        case TypeNumber:
            return js_new_boolean(v.as.number != 0);
        case TypeString:
            return js_new_boolean(v.as.string.length > 0);
        case TypeBoolean:
            return v;
        case TypeObject:
            return js_new_boolean(1);
        case TypeUndefined:
            return js_new_boolean(0);
    }
}

JSValue js_to_object(JSEnv* env, JSValue v) {
    if (v.type == TypeObject) {
        return v;
    } else if (v.type == TypeNumber) {
        JS_CALL_STACK_PUSH(v);
        return js_invoke_constructor(env, js_get_global(env, string_from_cstring("Number")), 1);
    } else if (v.type == TypeString) {
        JS_CALL_STACK_PUSH(v);
        return js_invoke_constructor(env, js_get_global(env, string_from_cstring("String")), 1);
    } else {
        fprintf(stderr, "Cannot convert to object");
        exit(1);
    }
}

// TODO replace with js_to_boolean
int js_is_truthy(JSValue v) {
    switch (v.type) {
        case TypeNumber:
            return v.as.number != 0;
        case TypeString:
            return v.as.string.length > 0;
        case TypeBoolean:
            return v.as.boolean;
        case TypeObject:
            return v.as.object != NULL;
        case TypeUndefined:
            return 0;
    }
}

// --- operators --------------------------------------------------------------

JSValue js_typeof(JSValue v) {
    switch (v.type) {
        case TypeNumber:
            return js_string_value_from_cstring("number");
        case TypeString:
            return js_string_value_from_cstring("string");
        case TypeBoolean:
            return js_string_value_from_cstring("boolean");
        case TypeObject:
            if (JS_IS_FUNCTION(v)) {
                return js_string_value_from_cstring("function");
            } else {
                return js_string_value_from_cstring("object");
            }
        case TypeUndefined:
            return js_string_value_from_cstring("undefined");
    }
}

JSValue js_instanceof(JSEnv* env, JSValue left, JSValue right) {
    if (left.type != TypeObject) {
        return js_new_boolean(0);
    }
    if (! JS_IS_FUNCTION(right)) {
        // TODO throw better exception
        js_throw(env, js_string_value_from_cstring("TypeError"));
    }
    JSValue constructor_prototype = object_get_property(right.as.object, string_from_cstring("prototype"));
    if (constructor_prototype.type != TypeObject) {
        // TODO throw better exception
        js_throw(env, js_string_value_from_cstring("TypeError"));
    }
    JSObject* object = left.as.object;

    while (object != NULL) {
        if (object->prototype == constructor_prototype.as.object) {
            return js_new_boolean(1);
        } else {
            object = object->prototype;
        }
    }
    return js_new_boolean(0);
}

JSValue js_add(JSEnv* env, JSValue v1, JSValue v2) {
    if (v1.type == TypeString || v2.type == TypeString) {
        v1 = js_to_string(env, v1);
        v2 = js_to_string(env, v2);

        // TODO js_string_concat
        char* new_cstring = malloc(sizeof(char) * (v1.as.string.length + v2.as.string.length + 1));
        memcpy(new_cstring, v1.as.string.cstring, v1.as.string.length);
        memcpy(new_cstring + v1.as.string.length, v2.as.string.cstring, v2.as.string.length);
        new_cstring[v1.as.string.length + v2.as.string.length] = '\0';
        return js_string_value_from_cstring(new_cstring);
    } else {
        return js_new_number(js_to_number(env, v1).as.number + js_to_number(env, v2).as.number);
    }
}

JSValue js_sub(JSEnv* env, JSValue v1, JSValue v2) {
    return js_new_number(js_to_number(env, v1).as.number - js_to_number(env, v2).as.number);
}

JSValue js_mult(JSEnv* env, JSValue v1, JSValue v2) {
    return js_new_number(v1.as.number * v2.as.number);
}

JSValue js_strict_eq(JSEnv* env, JSValue v1, JSValue v2) {
    if (v1.type != v2.type) {
        return js_new_boolean(0);
    }
    switch (v1.type) {
        case TypeNumber:
            return js_new_boolean(v1.as.number == v2.as.number);
        case TypeString:
            return js_new_boolean(
                (v1.as.string.length == v2.as.string.length) &&
                (memcmp(v1.as.string.cstring, v2.as.string.cstring, v1.as.string.length) == 0)
            );
        case TypeBoolean:
            return js_new_boolean(v1.as.boolean == v2.as.boolean);
        case TypeObject:
            return js_new_boolean(v1.as.object == v2.as.object);
        case TypeUndefined:
            return js_new_boolean(1);
    }
}

JSValue js_strict_neq(JSEnv* env, JSValue v1, JSValue v2) {
    return js_new_boolean(! js_strict_eq(env, v1, v2).as.boolean);
}

JSValue js_eq(JSEnv* env, JSValue v1, JSValue v2) {
    return js_strict_eq(env, v1, v2);
}

JSValue js_neq(JSEnv* env, JSValue v1, JSValue v2) {
    return js_strict_neq(env, v1, v2);
}

JSValue js_lt(JSEnv* env, JSValue v1, JSValue v2) {
    return js_new_boolean(js_to_number(env, v1).as.number < js_to_number(env, v2).as.number);
}

JSValue js_gt(JSEnv* env, JSValue v1, JSValue v2) {
    return js_new_boolean(js_to_number(env, v1).as.number > js_to_number(env, v2).as.number);
}

JSValue js_binary_and(JSEnv* env, JSValue v1, JSValue v2) {
    return js_new_number(js_to_number(env, v1).as.number & js_to_number(env, v2).as.number);
}

JSValue js_binary_xor(JSEnv* env, JSValue v1, JSValue v2) {
    return js_new_number(js_to_number(env, v1).as.number ^ js_to_number(env, v2).as.number);
}

JSValue js_binary_or(JSEnv* env, JSValue v1, JSValue v2) {
    return js_new_number(js_to_number(env, v1).as.number | js_to_number(env, v2).as.number);
}

JSValue js_logical_and(JSEnv* env, JSValue v1, JSValue v2) {
    if (js_is_truthy(js_to_boolean(v1))) {
        return v2;
    } else {
        return v1;
    }
}

JSValue js_logical_or(JSEnv* env, JSValue v1, JSValue v2) {
    if (js_is_truthy(js_to_boolean(v1))) {
        return v1;
    } else {
        return v2;
    }
}

// --- function calls ---------------------------------------------------------

JSValue js_call_function(JSEnv* env, JSValue v, JSValue this, int stack_count) {
    if (JS_IS_FUNCTION(v)) {
        JSFunctionObject* function_object = (JSFunctionObject*) v.as.object;
        return (function_object->function)(env, this, stack_count, function_object->binding);
    } else {
        JSValue message = js_add(env, js_typeof(v), js_string_value_from_cstring(" is not a function."));
        JS_CALL_STACK_PUSH(message);
        JSValue exception = js_invoke_constructor(env, js_get_global(env, string_from_cstring("TypeError")), 1);
        js_throw(env, exception);
    }
}

JSValue js_call_method(JSEnv* env, JSValue object, JSValue key, int stack_count) {
    object = js_to_object(env, object);
    JSValue function = js_get_property(env, object, key);
    if (function.type == TypeUndefined) {
        // TypeError: Object #{object} has no method '#{key}'
        JSValue message =
            js_add(env, js_string_value_from_cstring("Object "),
                js_add(env, js_to_string(env, object),
                    js_add(env, js_string_value_from_cstring(" has no method '"),
                        js_add(env, js_to_string(env, key), js_string_value_from_cstring("'"))
                    )
                )
            );
        JS_CALL_STACK_PUSH(message);
        JSValue exception = js_invoke_constructor(env, js_get_global(env, string_from_cstring("TypeError")), 1);
        js_throw(env, exception);
    }
    if (! JS_IS_FUNCTION(function)) {
        // TypeError: Property 'wtf' of object #<Object> is not a function
        JSValue message =
            js_add(env, js_string_value_from_cstring("Property '"),
                js_add(env, js_to_string(env, key),
                    js_add(env, js_string_value_from_cstring("' of object "),
                        js_add(env, js_to_string(env, object), js_string_value_from_cstring(" is not a function"))
                    )
                )
            );
        JS_CALL_STACK_PUSH(message);
        JSValue exception = js_invoke_constructor(env, js_get_global(env, string_from_cstring("TypeError")), 1);
        js_throw(env, exception);
    }
    return js_call_function(env, function, object, stack_count);
}

JSValue js_invoke_constructor(JSEnv* env, JSValue function, int stack_count) {
    JSValue this = js_construct_object_value(env);
    JSValue constructor_prototype = object_get_property(function.as.object, string_from_cstring("prototype"));
    if (constructor_prototype.type == TypeObject) {
        this.as.object->prototype = constructor_prototype.as.object;
    } else {
        this.as.object->prototype = js_get_property(env, js_get_global(env, string_from_cstring("Object")),
            js_string_value_from_cstring("prototype")).as.object;
    }
    JSValue ret = js_call_function(env, function, this, stack_count);
    if (ret.type == TypeObject) {
        return ret;
    } else {
        return this;
    }
}

void js_call_stack_push(JSEnv* env, JSValue value) {
    // env->call_stack_count++;
    env->call_stack[env->call_stack_count++] = value;
}

void js_call_stack_pop(JSEnv* env) {
    env->call_stack_count--;
}

JSValue js_call_stack_pop_and_return(JSEnv* env, JSValue value) {
    env->call_stack_count--;
    return value;
}

void js_check_call_stack_overflow(JSEnv* env, int n) {
    if (env->call_stack_count + n >= JS_CALL_STACK_SIZE) {
        fprintf(stderr, "Call stack overflow: %d\n", env->call_stack_count + n);
        exit(1);
    }
}

// --- variables --------------------------------------------------------------

JSValue js_assign_variable(JSEnv* env, JSObject* binding, JSString name, JSValue value) {
    JSProperty* property = object_find_property(binding, name);
    if (property != NULL) {
        property->value = value;
    } else {
        object_set_property(env->global.as.object, name, value);
    }
    return value;
}

JSValue js_get_variable_rvalue(JSEnv* env, JSObject* binding, JSString name) {
    JSProperty* property = object_find_property(binding, name);
    if (property != NULL) {
        return property->value;
    } else {
        JSProperty* global_property = object_find_own_property(env->global.as.object, name);
        if (global_property) {
            return global_property->value;
        } else {
            JSValue message = js_add(env, js_string_value_from_string(name), js_string_value_from_cstring(" is not defined."));
            JS_CALL_STACK_PUSH(message);
            JSValue exception = js_invoke_constructor(env, js_get_global(env, string_from_cstring("ReferenceError")), 1);
            js_throw(env, exception);
        }
    }
}

// --- exceptions -------------------------------------------------------------

JSException* js_push_new_exception(JSEnv *env) {
    if (env->exceptions_count >= JS_EXCEPTION_STACK_SIZE) {
        fprintf(stderr, "Exception stack overflow.\n");
        exit(1);
    }
    env->exceptions_count++;
    return &env->exceptions[env->exceptions_count - 1];
}

JSException* js_pop_exception(JSEnv *env) {
    if (env->exceptions_count == 0) {
        fprintf(stderr, "Cannot pop exception from empty stack.\n");
        exit(1);
    }
    env->exceptions_count--;
    return &env->exceptions[env->exceptions_count];
}

JSException* js_last_exception(JSEnv *env) {
    if (env->exceptions_count == 0) {
        fprintf(stderr, "Cannot return exception from empty stack.\n");
        exit(1);
    }
    return &env->exceptions[env->exceptions_count - 1];
}

void js_throw(JSEnv* env, JSValue value) {
    JSException* exc = js_last_exception(env);
    exc->value = value;
    longjmp(exc->jmp, 1);
}

// --- strings ----------------------------------------------------------------

static JSString string_from_cstring(char* cstring) {
    JSString string;
    string.cstring = cstring;
    string.length = strlen(cstring);
    return string;
}

static char* string_to_cstring(JSString string) {
    if (string.cstring[string.length] == '\0') {
        return string.cstring;
    } else {
        char* new_cstring = malloc(sizeof(char) * (string.length + 1));
        memcpy(new_cstring, string.cstring, string.length);
        new_cstring[string.length] = '\0';
        return new_cstring;
    }
}

static JSString string_char_at(JSString string, int index) {
    JSString new_string;
    new_string.cstring = string.cstring + index;
    new_string.length = 1;
    return new_string;
}

static int string_cmp(JSString s1, JSString s2) {
    int min_length = s1.length < s2.length ? s1.length : s2.length;
    int result = memcmp(s1.cstring, s2.cstring, min_length);
    if (result == 0) {
        return s1.length - s2.length;
    } else {
        return result;
    }
}

// FNV-1a hash, see http://isthe.com/chongo/tech/comp/fnv/
static JSStringHash string_to_hash(JSString string) {
    int i = 0;
    unsigned int result = 2166136261u;
    while (i < string.length) {
        result ^= string.cstring[i];
        result *= 16777619u;
        i++;
    }
    return result;
}

// --- objects ----------------------------------------------------------------

static JSObject* object_alloc() {
    return malloc(sizeof(JSObject));
}

static void object_destroy(JSObject* object) {
    if (object->properties) {
        free(object->properties);
    }
    free(object);
}

static JSObject* object_init(JSObject* object, JSObject* prototype) {
    object->properties = NULL;
    object->properties_count = 0;
    object->properties_size = 0;
    object->prototype = prototype;
    object->class = ClassObject;
    return object;
}

static JSObject* object_new(JSObject* prototype) {
    return object_init(object_alloc(), prototype);
}

static JSProperty* object_find_own_property_with_hash(JSObject* object, JSString key, JSStringHash key_hash) {
    int i = 0;
    while (i < object->properties_count) {
        JSProperty* prop = object->properties + i;
        if (prop->key_hash == key_hash && string_cmp(prop->key, key) == 0) {
            return prop;
        } else {
            i++;
        }
    }
    return NULL;
}

static JSProperty* object_find_own_property(JSObject* object, JSString key) {
    return object_find_own_property_with_hash(object, key, string_to_hash(key));
}

static JSProperty* object_find_property(JSObject* object, JSString key) {
    JSStringHash key_hash = string_to_hash(key);

    while (object != NULL) {
        JSProperty* prop = object_find_own_property_with_hash(object, key, key_hash);
        if (prop != NULL) {
            return prop;
        } else {
            object = object->prototype;
        }
    }
    return NULL;
}

static int object_has_own_property(JSObject* object, JSString key) {
    return !! object_find_own_property(object, key);
}

static JSValue object_get_own_property(JSObject* object, JSString key) {
    JSProperty* prop = object_find_own_property(object, key);
    if (prop != NULL) {
        return prop->value;
    } else {
        return js_new_undefined();
    }
}

static JSValue object_get_property(JSObject* object, JSString key) {
    JSProperty* prop = object_find_property(object, key);
    if (prop != NULL) {
        return prop->value;
    } else {
        return js_new_undefined();
    }
}

// Faster than object_set_property, because it doesn't check whether property exists.
static void object_add_property(JSObject* object, JSString key, JSValue value) {
    if (object->properties_count >= object->properties_size) {
        if (object->properties_size == 0) {
            object->properties_size = 1;
        } else {
            object->properties_size *= 2;
        }
        object->properties = realloc(object->properties, sizeof(JSProperty) * object->properties_size);
    }
    JSProperty* prop = &object->properties[object->properties_count];
    prop->key = key;
    prop->key_hash = string_to_hash(key);
    prop->value = value;
    object->properties_count++;
}

static void object_set_property(JSObject* object, JSString key, JSValue value) {
    JSProperty* prop = object_find_own_property(object, key);
    if (prop != NULL) {
        prop->value = value;
        return;
    } else {
        object_add_property(object, key, value);
    }
}

// --- function objects -------------------------------------------------------

static JSFunctionObject* function_object_alloc() {
    return malloc(sizeof(JSFunctionObject));
}

static JSFunctionObject* function_object_new(JSObject* prototype, JSValue (*function_ptr)(), JSObject* binding) {
    JSFunctionObject* object = function_object_alloc();
    object_init((JSObject*) object, prototype);
    ((JSObject*) object)->class = ClassFunction;
    object->function = function_ptr;
    object->binding = binding;
    return object;
}

// --- properties -------------------------------------------------------------

JSValue js_get_property(JSEnv* env, JSValue value, JSValue key) {
    switch (value.type) {
        case TypeUndefined:
            // TypeError: Cannot read property '#{key}' of undefined
            {
                JSValue message =
                    js_add(env, js_string_value_from_cstring("Cannot read property '"),
                        js_add(env, js_to_string(env, key), js_string_value_from_cstring("' of undefined")));
                JS_CALL_STACK_PUSH(message);
                JSValue exception = js_invoke_constructor(env, js_get_global(env, string_from_cstring("TypeError")), 1);
                js_throw(env, exception);
            }
            break;
        case TypeNumber:
            return js_get_property(env, js_to_object(env, value), js_to_string(env, key));
        case TypeString:
            if (key.type == TypeNumber && key.as.number >= 0) {
                if (key.as.number >= value.as.string.length) {
                    return js_new_undefined();
                } else {
                    return js_string_value_from_string(string_char_at(value.as.string, key.as.number));
                }
            }
            key = js_to_string(env, key);
            if (string_cmp(key.as.string, string_from_cstring("length")) == 0) {
                return js_new_number(value.as.string.length);
            } else {
                return js_get_property(env, js_to_object(env, value), key);
            }
        case TypeBoolean:
            return js_get_property(env, js_to_object(env, value), js_to_string(env, key));
        case TypeObject:
            return object_get_property(value.as.object, js_to_string(env, key).as.string);
    }
}

JSValue js_set_property(JSEnv* env, JSValue object, JSValue key, JSValue value) {
    object = js_to_object(env, object);
    object_set_property(object.as.object, js_to_string(env, key).as.string, value);

    if (object.as.object->class == ClassArray && key.type == TypeNumber) {
        int length = js_to_number(env, object_get_property(object.as.object,
            string_from_cstring("length"))).as.number;
        if (key.as.number >= length) {
            object_set_property(object.as.object, string_from_cstring("length"), js_new_number(key.as.number + 1));
        }
    }

    return value;
}

JSValue js_add_property(JSEnv* env, JSValue object, JSValue key, JSValue value) {
    object_set_property(js_to_object(env, object).as.object, js_to_string(env, key).as.string, value);
    return object;
}

JSValue js_get_global(JSEnv* env, JSString key) {
    return object_get_property(env->global.as.object, key);
}

// --- garbage collection -----------------------------------------------------

void js_gc_setup(JSEnv* env) {
    env->objects = malloc(sizeof(JSObject*) * 1024);
    env->objects_size = 1024;
    env->objects_count = 0;
    env->gc_last_objects_count = 0;
}

void js_gc_save_object(JSEnv* env, JSObject* object) {
    if (env->objects_count >= env->objects_size) {
        env->objects_size *= 2;
        env->objects = realloc(env->objects, sizeof(JSObject) * env->objects_size);
    }
    env->objects[env->objects_count] = object;
    env->objects_count++;
}

static void gc_stack_push(JSObject* stack[], int* stack_counter, JSObject* object) {
    if (object == NULL) return;
    if (object->gc_mark) return;
    if (*stack_counter >= JS_GC_STACK_DEPTH) {
        fprintf(stderr, "GC failed: stack overflow\n");
        exit(0);
    }
    stack[*stack_counter] = object;
    // *stack_counter = *stack_counter + 1;
    (*stack_counter)++;
    object->gc_mark = 1;
    return;
}

static JSObject* gc_stack_pop(JSObject* stack[], int* stack_counter) {
    // *stack_counter = *stack_counter - 1;
    (*stack_counter)--;
    JSObject* object = stack[*stack_counter];
    return object;
}

static JSObject* gc_run(JSEnv* env, va_list args) {
    int i, j;

#ifdef JS_GC_VERBOSE
    fprintf(stderr, "gc start: %d\n", env->objects_count);
#endif

    for (i = 0; i < env->objects_count; i++) {
        env->objects[i]->gc_mark = 0;
    }

    JSObject* stack[JS_GC_STACK_DEPTH];
    int stack_ptr = 0;

    JSObject* object = NULL;
    do {
        object = va_arg(args, JSObject*);
        gc_stack_push(stack, &stack_ptr, object);
    } while (object != NULL);

    for (i = 0; i < env->call_stack_count; i++) {
        JSValue value = env->call_stack[i];
        if (value.type == TypeObject) {
            gc_stack_push(stack, &stack_ptr, value.as.object);
        }
    }

    while (stack_ptr > 0) {
        JSObject* object = gc_stack_pop(stack, &stack_ptr);
        for (j = 0; j < object->properties_count; j++) {
            JSValue value = object->properties[j].value;
            if (value.type == TypeObject) {
                gc_stack_push(stack, &stack_ptr, value.as.object);
            }
        }
        gc_stack_push(stack, &stack_ptr, object->prototype);
        if (object->class == ClassFunction) {
            gc_stack_push(stack, &stack_ptr, ((JSFunctionObject*) object)->binding);
        }
    }

    for (i = 0; i < env->objects_count; i++) {
        if (env->objects[i]->gc_mark == 0) {
            object_destroy(env->objects[i]);
            env->objects[i] = NULL;
        }
    }

    j = 0;
    for (i = 0; i < env->objects_count; i++) {
        if (env->objects[i] != NULL) {
            env->objects[j] = env->objects[i];
            j++;
        }
    }
    env->objects_count = j;
    env->gc_last_objects_count = env->objects_count;

#ifdef JS_GC_VERBOSE
    fprintf(stderr, "gc end: %d\n", env->objects_count);
#endif
}

int js_gc_should_run(JSEnv* env) {
    return env->objects_count > JS_GC_THRESHOLD && env->objects_count > 2 * env->gc_last_objects_count;
}

void js_gc_run(JSEnv* env, ...) {
    va_list args;
    va_start(args, env);
    gc_run(env, args);
    va_end(args);
}

// --- built-in objects -------------------------------------------------------

JSValue js_object_constructor(JSEnv* env, JSValue this, int stack_count, JSObject* binding) {
    return js_construct_object_value(env);
}

JSValue js_object_is_prototype_of(JSEnv* env, JSValue this, int stack_count, JSObject* binding) {
    if (stack_count == 0) return js_new_boolean(0);
    JSValue object_value = JS_CALL_STACK_ITEM(0);
    JS_CALL_STACK_POP;

    if (object_value.type != TypeObject) return js_new_boolean(0);
    JSObject* object = object_value.as.object;
    this = js_to_object(env, this);

    while (object != NULL) {
        if (object->prototype == this.as.object) {
            return js_new_boolean(1);
        }
        object = object->prototype;
    }
    return js_new_boolean(0);
}

JSValue js_object_has_own_property(JSEnv* env, JSValue this, int stack_count, JSObject* binding) {
    JSValue key = js_to_string(env, JS_CALL_STACK_ITEM(0));
    JS_CALL_STACK_POP;

    this = js_to_object(env, this);
    return js_new_boolean(object_has_own_property(this.as.object, key.as.string));
}

JSValue js_function_constructor(JSEnv* env, JSValue this, int stack_count, JSObject* binding) {
    js_throw(env, js_string_value_from_cstring("Cannot use Function constructor in compiled code."));
}

JSValue js_function_prototype_call(JSEnv* env, JSValue this, int stack_count, JSObject* binding) {
    JSValue new_this;
    if (stack_count == 0) {
        new_this = js_new_undefined();
    } else {
        new_this = JS_CALL_STACK_ITEM(0);
    }
    JSValue ret = js_call_function(env, this, new_this, stack_count - 1);
    env->call_stack_count--;
    return ret;
}

JSValue js_function_prototype_apply(JSEnv* env, JSValue this, int stack_count, JSObject* binding) {
    JSValue new_this;
    int length = 0;
    if (stack_count == 0) {
        new_this = js_new_undefined();
    } else {
        new_this = JS_CALL_STACK_ITEM(0);
    }
    if (stack_count > 1) {
        JSValue args_obj = JS_CALL_STACK_ITEM(1);
        JS_CALL_STACK_POP;

        if (args_obj.type == TypeObject) {
            // FIXME will fail if "length" does not exist or is not number
            int i;
            length = object_get_property(args_obj.as.object, string_from_cstring("length")).as.number;
            for (i = 0; i < length; i++) {
                JS_CALL_STACK_PUSH(js_get_property(env, args_obj, js_new_number(i)));
            }
        }
    } else {
        JS_CALL_STACK_POP;
    }
    return js_call_function(env, this, new_this, length);
}

JSValue js_array_constructor(JSEnv* env, JSValue this, int stack_count, JSObject* binding) {
    int i = 0;
    while (i < stack_count) {
        object_set_property(this.as.object,
            js_to_string(env, js_new_number(i)).as.string, JS_CALL_STACK_ITEM(i));
        i++;
    }
    object_set_property(this.as.object, string_from_cstring("length"), js_new_number(i));
    this.as.object->class = ClassArray;
    JS_CALL_STACK_POP;
    return this;
}

JSValue js_number_constructor(JSEnv* env, JSValue this, int stack_count, JSObject* binding) {
    this.as.object->primitive = JS_CALL_STACK_ITEM(0);
    JS_CALL_STACK_POP;
    return this;
}

JSValue js_number_value_of(JSEnv* env, JSValue this, int stack_count, JSObject* binding) {
    JS_CALL_STACK_POP;
    return this.as.object->primitive;
}

JSValue js_number_to_string(JSEnv* env, JSValue this, int stack_count, JSObject* binding) {
    return js_to_string(env, js_number_value_of(env, this, stack_count, binding));
}

JSValue js_string_constructor(JSEnv* env, JSValue this, int stack_count, JSObject* binding) {
    JSValue primitive;
    primitive = JS_CALL_STACK_ITEM(0);
    JS_CALL_STACK_POP;

    primitive = js_to_string(env, primitive);
    this.as.object->primitive = primitive;
    object_set_property(this.as.object, string_from_cstring("length"),
        js_new_number(primitive.as.string.length));

    return this;
}

JSValue js_string_value_of(JSEnv* env, JSValue this, int stack_count, JSObject* binding) {
    JS_CALL_STACK_POP;
    return this.as.object->primitive;
}

JSValue js_string_to_string(JSEnv* env, JSValue this, int stack_count, JSObject* binding) {
    JS_CALL_STACK_POP;
    return js_string_value_of(env, this, 0, binding);
}

JSValue js_string_char_at(JSEnv* env, JSValue this, int stack_count, JSObject* binding) {
    int i = js_to_number(env, JS_CALL_STACK_ITEM(0)).as.number;
    this = js_to_string(env, this);
    JS_CALL_STACK_POP;

    if (i < 0 || i >= this.as.string.length) {
        return js_new_undefined();
    } else {
        return js_string_value_from_string(string_char_at(this.as.string, i));
    }
}

JSValue js_string_substring(JSEnv* env, JSValue this, int stack_count, JSObject* binding) {
    JSString string = js_string_value_of(env, this, 0, NULL).as.string;
    int from = js_to_number(env, (JSValue) JS_CALL_STACK_ITEM(0)).as.number;
    int to = js_to_number(env, (JSValue) JS_CALL_STACK_ITEM(1)).as.number;
    JS_CALL_STACK_POP;

    if (to > string.length) {
        to = string.length;
    }
    JSString new_string;
    new_string.cstring = string.cstring + from;
    new_string.length = to - from;

    return js_string_value_from_string(new_string);
}

JSValue js_string_index_of(JSEnv* env, JSValue this, int stack_count, JSObject* binding) {
    char *string = js_to_string(env, this).as.string.cstring;
    int i = 0, j;
    JSValue js_substring, js_position;
    if (stack_count == 0) {
        js_substring = js_new_undefined();
    } else {
        js_substring = JS_CALL_STACK_ITEM(0);
    }
    if (stack_count == 1) {
        js_position = js_new_undefined();
    } else {
        js_position = JS_CALL_STACK_ITEM(1);
        i = js_to_number(env, js_position).as.number;
    }
    JS_CALL_STACK_POP;

    char *substring = js_to_string(env, js_substring).as.string.cstring;
    int string_len = strlen(string);
    int substring_len = strlen(substring);

    for (; i < string_len - substring_len; i++) {
        for (j = 0; j < substring_len; j++) {
            if (string[i+j] != substring[j]) break;
        }
        if (j == substring_len) return js_new_number(i);
    }
    return js_new_number(-1);
}

JSValue js_string_slice(JSEnv* env, JSValue this, int stack_count, JSObject* binding) {
    int start = js_to_number(env, JS_CALL_STACK_ITEM(0)).as.number;
    JS_CALL_STACK_POP;
    this = js_to_string(env, this);
    JSString string;
    string.cstring = this.as.string.cstring + start;
    string.length = this.as.string.length - start;
    return js_string_value_from_string(string);
}

JSValue js_console_log(JSEnv* env, JSValue this, int stack_count, JSObject* binding) {
    printf("%s\n", string_to_cstring(js_to_string(env, JS_CALL_STACK_ITEM(0)).as.string));
    JS_CALL_STACK_POP;
    return js_new_undefined();
}

JSValue js_console_error(JSEnv* env, JSValue this, int stack_count, JSObject* binding) {
    fprintf(stderr, "%s\n", string_to_cstring(js_to_string(env, JS_CALL_STACK_ITEM(0)).as.string));
    JS_CALL_STACK_POP;
    return js_new_undefined();
}

JSValue js_read_file(JSEnv* env, JSValue this, int stack_count, JSObject* binding) {
    char* file_name = string_to_cstring(js_to_string(env, JS_CALL_STACK_ITEM(0)).as.string);
    JS_CALL_STACK_POP;
    FILE *fp = fopen(file_name, "rb");
    if (fp == NULL) js_throw(env, js_string_value_from_cstring("Cannot open file"));

    fseek(fp, 0, SEEK_END);
    int size = ftell(fp);
    fseek(fp, 0, SEEK_SET);

    char* contents = malloc(sizeof(char) * (size + 1));
    fread(contents, 1, size, fp);
    fclose(fp);
    contents[size] = '\0';
    return js_string_value_from_cstring(contents);
}

JSValue js_write_file(JSEnv* env, JSValue this, int stack_count, JSObject* binding) {
    char* file_name = string_to_cstring(js_to_string(env, JS_CALL_STACK_ITEM(0)).as.string);
    char* contents = string_to_cstring(js_to_string(env, JS_CALL_STACK_ITEM(1)).as.string);
    JS_CALL_STACK_POP;
    FILE *fp = fopen(file_name, "wb");
    if (fp == NULL) js_throw(env, js_string_value_from_cstring("Cannot open file"));
    fwrite(contents, 1, strlen(contents), fp);
    fclose(fp);
    return js_new_undefined();
}

JSValue js_system(JSEnv* env, JSValue this, int stack_count, JSObject* binding) {
    char* command = string_to_cstring(js_to_string(env, JS_CALL_STACK_ITEM(0)).as.string);
    JS_CALL_STACK_POP;
    return js_new_number(system(command));
}

void js_create_native_objects(JSEnv* env) {
    JSValue global = env->global;
    js_set_property(env, global, js_string_value_from_cstring("global"), global);

    JSValue object_prototype = js_object_value_from_object(object_new(NULL));
    JSValue object_constructor =
        js_object_value_from_object(
            (JSObject*) function_object_new(NULL, &js_object_constructor, NULL));
    js_gc_save_object(env, object_prototype.as.object);
    js_gc_save_object(env, object_constructor.as.object);
    js_set_property(env, object_constructor, js_string_value_from_cstring("prototype"), object_prototype);
    js_set_property(env, object_prototype, js_string_value_from_cstring("constructor"), object_constructor);
    js_set_property(env, global, js_string_value_from_cstring("Object"), object_constructor);

    JSValue function_constructor =
        js_object_value_from_object(
            (JSObject*) function_object_new(object_prototype.as.object, &js_function_constructor, NULL));
    JSValue function_prototype = js_construct_object_value(env);
    js_gc_save_object(env, function_constructor.as.object);
    js_set_property(env, function_constructor, js_string_value_from_cstring("prototype"), function_prototype);
    js_set_property(env, function_prototype, js_string_value_from_cstring("constructor"), function_constructor);
    js_set_property(env, global, js_string_value_from_cstring("Function"), function_constructor);
    js_set_property(env, function_prototype, js_string_value_from_cstring("call"),
        js_construct_function_object_value(env, &js_function_prototype_call, NULL));
    js_set_property(env, function_prototype, js_string_value_from_cstring("apply"),
        js_construct_function_object_value(env, &js_function_prototype_apply, NULL));

    js_set_property(env, object_prototype, js_string_value_from_cstring("isPrototypeOf"),
        js_construct_function_object_value(env, &js_object_is_prototype_of, NULL));
    js_set_property(env, object_prototype, js_string_value_from_cstring("hasOwnProperty"),
        js_construct_function_object_value(env, &js_object_has_own_property, NULL));

    JSValue array_constructor = js_construct_function_object_value(env, &js_array_constructor, NULL);
    js_set_property(env, global, js_string_value_from_cstring("Array"), array_constructor);

    JSValue number_constructor = js_construct_function_object_value(env, &js_number_constructor, NULL);
    JSValue number_prototype = js_get_property(env, number_constructor, js_string_value_from_cstring("prototype"));
    js_set_property(env, global, js_string_value_from_cstring("Number"), number_constructor);
    js_set_property(env, number_prototype, js_string_value_from_cstring("valueOf"), js_construct_function_object_value(env, &js_number_value_of, NULL));
    js_set_property(env, number_prototype, js_string_value_from_cstring("toString"), js_construct_function_object_value(env, &js_number_to_string, NULL));

    JSValue string_constructor = js_construct_function_object_value(env, &js_string_constructor, NULL);
    JSValue string_prototype = js_get_property(env, string_constructor, js_string_value_from_cstring("prototype"));
    js_set_property(env, global, js_string_value_from_cstring("String"), string_constructor);
    js_set_property(env, string_prototype, js_string_value_from_cstring("valueOf"), js_construct_function_object_value(env, &js_string_value_of, NULL));
    js_set_property(env, string_prototype, js_string_value_from_cstring("toString"), js_construct_function_object_value(env, &js_string_to_string, NULL));
    js_set_property(env, string_prototype, js_string_value_from_cstring("charAt"), js_construct_function_object_value(env, &js_string_char_at, NULL));
    js_set_property(env, string_prototype, js_string_value_from_cstring("substring"), js_construct_function_object_value(env, &js_string_substring, NULL));
    js_set_property(env, string_prototype, js_string_value_from_cstring("indexOf"), js_construct_function_object_value(env, &js_string_index_of, NULL));
    js_set_property(env, string_prototype, js_string_value_from_cstring("slice"), js_construct_function_object_value(env, &js_string_slice, NULL));

    JSValue console = js_construct_object_value(env);
    js_set_property(env, console, js_string_value_from_cstring("log"), js_construct_function_object_value(env, &js_console_log, NULL));
    js_set_property(env, console, js_string_value_from_cstring("error"), js_construct_function_object_value(env, &js_console_error, NULL));
    js_set_property(env, global, js_string_value_from_cstring("console"), console);

    js_set_property(env, global, js_string_value_from_cstring("readFileSync"), js_construct_function_object_value(env, &js_read_file, NULL));
    js_set_property(env, global, js_string_value_from_cstring("writeFileSync"), js_construct_function_object_value(env, &js_write_file, NULL));
    js_set_property(env, global, js_string_value_from_cstring("system"), js_construct_function_object_value(env, &js_system, NULL));
}

void js_create_argv(JSEnv* env, int argc, char** argv) {
    int i;
    for (i = 0; i < argc; i++) {
        JS_CALL_STACK_PUSH(js_string_value_from_cstring(argv[i]));
    }
    JSValue js_argv = js_invoke_constructor(env, js_get_global(env, string_from_cstring("Array")), argc);
    js_set_property(env, env->global, js_string_value_from_cstring("argv"), js_argv);
}
