#include <stdlib.h>
#include <string.h>
#include <setjmp.h>
#include "dict.c"

enum JSType {
    TypeUndefined,
    TypeNumber,
    TypeString,
    TypeBoolean,
    TypeFunction,
    TypeObject
};

typedef struct TJSClosure {
    struct TJSValue (*function)();
    Dict binding;
    struct TJSObject* as_object;
} JSClosure;

typedef struct TJSValue {
    enum JSType type;
    union {
        int number;
        char* string;
        char boolean;
        struct TJSObject* object;
        JSClosure function;
    } as;
} JSValue;

struct JSValueDictElem {
    char* key;
    JSValue value;
    struct JSValueDictElem* next;
};

typedef struct JSValueDictElem* JSValueDict;

typedef struct TJSObject {
    JSValueDict properties;
    struct TJSObject* prototype;
    struct TJSValue primitive;
} JSObject;

typedef JSValue* JSVariable;

#define JS_EXCEPTION_STACK_SIZE 1024

#include "list.c"

typedef struct {
    jmp_buf jmp;
    JSValue value;
} JSException;

typedef struct {
    JSValue global;
    JSException exceptions[JS_EXCEPTION_STACK_SIZE];
    unsigned int exceptions_count;
} JSEnv;

JSValue js_new_bare_function(JSValue (*function_ptr)(), Dict binding);
void js_throw(JSEnv* env, JSValue exception);
JSValue js_call_method(JSEnv* env, JSValue object, JSValue key, List args);
JSValue js_invoke_constructor(JSEnv* env, JSValue function, List args);

static JSValueDict object_find_property(JSObject* object, char* key);
static JSValue object_get_own_property(JSObject* object, char* key);
static JSValue object_get_property(JSObject* object, char* key);
static void object_set_property(JSObject* object, char* key, JSValue value);

JSValue js_get_property(JSEnv* env, JSValue value, JSValue key);
JSValue js_set_property(JSEnv* env, JSValue object, JSValue key, JSValue value);
JSValue js_get_global(JSEnv* env, char* key);


// TODO remove
void js_dump_value(JSValue v)
{
    switch (v.type) {
        case TypeNumber:
            printf("%d", v.as.number);
            break;
        case TypeString:
            printf("%s", v.as.string);
            break;
        case TypeBoolean:
            if (v.as.boolean) {
                printf("true");
            } else {
                printf("false");
            }
            break;
        case TypeObject:
            printf("[object]");
            break;
        case TypeFunction:
            printf("[function]");
            break;
        case TypeUndefined:
            printf("[undefined]");
            break;
        default:
            printf("cannot dump value");
            break;
    }
}

// --- constructors for values ------------------------------------------------

JSValue js_new_number(int n) {
    JSValue v;
    v.type = TypeNumber;
    v.as.number = n;
    return v;
}

JSValue js_new_string(char* s) {
    JSValue v;
    v.type = TypeString;
    v.as.string = s;
    return v;
}

JSValue js_new_boolean(char i) {
    JSValue v;
    v.type = TypeBoolean;
    v.as.boolean = i;
    return v;
}

JSValue js_new_bare_object() {
    JSValue v;
    v.type = TypeObject;
    v.as.object = malloc(sizeof(JSObject));
    v.as.object->properties = NULL;
    v.as.object->prototype = NULL;
    return v;
}

JSValue js_new_object(JSEnv* env) {
    JSValue v = js_new_bare_object();
    v.as.object->properties = NULL;
    v.as.object->prototype =
        js_get_property(env, js_get_global(env, "Object"), js_new_string("prototype")).as.object;
    return v;
}

JSValue js_new_bare_function(JSValue (*function_ptr)(), Dict binding) {
    JSValue v;
    v.type = TypeFunction;
    JSClosure closure;
    closure.function = function_ptr;
    closure.binding = binding;
    v.as.function = closure;
    v.as.function.as_object = NULL;
    return v;
}

JSValue js_new_function(JSEnv* env, JSValue (*function_ptr)(), Dict binding) {
    JSValue v = js_new_bare_function(function_ptr, binding);

    // function is also an object, initialize properties dictionary
    v.as.function.as_object = malloc(sizeof(JSObject));
    v.as.function.as_object->properties = NULL;
    v.as.function.as_object->prototype =
        js_get_property(env, js_get_global(env, "Function"), js_new_string("prototype")).as.object;
    v.as.function.as_object->primitive = v;

    // every function has a prototype object for instances
    JSValue prototype = js_new_object(env);
    object_set_property(prototype.as.object, "constructor", v);
    object_set_property(v.as.function.as_object, "prototype", prototype);

    return v;
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
    if (v.type == TypeString) {
        return v;
    } else if (v.type == TypeNumber) {
        char len = 1;
        int a = v.as.number;
        if (a < 0) { a = -a; len++; }
        do { len++; a = a / 10; } while (a > 0);
        char* s = malloc(sizeof(char) * len);
        snprintf(s, len, "%d", v.as.number);
        return js_new_string(s);
    } else if (v.type == TypeObject) {
        JSValue to_string = object_get_property(v.as.object, "toString");
        if (to_string.type == TypeFunction) {
            return js_call_method(env, v, js_new_string("toString"), list_create());
        } else {
            return js_new_string("[object]");
        }
    } else if (v.type == TypeFunction) {
        return js_new_string("[function]");
    } else {
        fprintf(stderr, "Cannot convert to string");
        exit(1);
    }
}

JSValue js_to_number(JSValue v) {
    if (v.type == TypeNumber) {
        return v;
    } else if (v.type == TypeBoolean) {
        return js_new_number(v.as.boolean);
    } else {
        fprintf(stderr, "Cannot convert to number");
        exit(1);
    }
}

JSValue js_to_boolean(JSValue v) {
    switch (v.type) {
        case TypeNumber:
            return js_new_boolean(v.as.number != 0);
        case TypeString:
            return js_new_boolean(strlen(v.as.string) > 0);
        case TypeBoolean:
            return v;
        case TypeObject:
            return js_new_boolean(1);
        case TypeFunction:
            return js_new_boolean(1);
        case TypeUndefined:
            return js_new_boolean(0);
    }
}

JSValue js_to_object(JSEnv* env, JSValue v) {
    if (v.type == TypeObject) {
        return v;
    } else if (v.type == TypeFunction) {
        JSValue v2;
        v2.type = TypeObject;
        v2.as.object = v.as.function.as_object;
        return v2;
    } else if (v.type == TypeNumber) {
        return js_invoke_constructor(env, js_get_global(env, "Number"),
            list_insert(list_create(), v));
    } else if (v.type == TypeString) {
        return js_invoke_constructor(env, js_get_global(env, "String"),
            list_insert(list_create(), v));
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
            return strlen(v.as.string) > 0;
        case TypeBoolean:
            return v.as.boolean;
        case TypeObject:
            return v.as.object != NULL;
        case TypeFunction:
            return 1;
        case TypeUndefined:
            return 0;
    }
}

// --- operators --------------------------------------------------------------

JSValue js_typeof(JSValue v) {
    switch (v.type) {
        case TypeNumber:
            return js_new_string("number");
        case TypeString:
            return js_new_string("string");
        case TypeBoolean:
            return js_new_string("boolean");
        case TypeObject:
            return js_new_string("object");
        case TypeFunction:
            return js_new_string("function");
        case TypeUndefined:
            return js_new_string("undefined");
    }
}

JSValue js_instanceof(JSEnv* env, JSValue left, JSValue right) {
    if (left.type != TypeObject) {
        return js_new_boolean(0);
    }
    if (right.type != TypeFunction) {
        js_throw(env, js_new_string("TypeError"));
    }
    JSValue constructor_prototype = object_get_property(right.as.function.as_object, "prototype");
    if (constructor_prototype.type != TypeObject) {
        js_throw(env, js_new_string("TypeError"));
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
        char* str1 = js_to_string(env, v1).as.string;
        char* str2 = js_to_string(env, v2).as.string;

        char* new_string = malloc(sizeof(char) * (strlen(str1) + strlen(str2) + 1));
        strcpy(new_string, str1);
        strcat(new_string, str2);
        return js_new_string(new_string);
    } else {
        return js_new_number(js_to_number(v1).as.number + js_to_number(v2).as.number);
    }
}

JSValue js_sub(JSEnv* env, JSValue v1, JSValue v2) {
    return js_new_number(js_to_number(v1).as.number - js_to_number(v2).as.number);
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
            return js_new_boolean(strcmp(v1.as.string, v2.as.string) == 0);
        case TypeBoolean:
            return js_new_boolean(v1.as.boolean == v2.as.boolean);
        case TypeObject:
            return js_new_boolean(v1.as.object == v2.as.object);
        case TypeFunction:
            return js_new_boolean(v1.as.function.function == v2.as.function.function
                && v1.as.function.binding == v2.as.function.binding);
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
    return js_new_boolean(js_to_number(v1).as.number < js_to_number(v2).as.number);
}

JSValue js_gt(JSEnv* env, JSValue v1, JSValue v2) {
    return js_new_boolean(js_to_number(v1).as.number > js_to_number(v2).as.number);
}

JSValue js_binary_and(JSEnv* env, JSValue v1, JSValue v2) {
    return js_new_number(js_to_number(v1).as.number & js_to_number(v2).as.number);
}

JSValue js_binary_xor(JSEnv* env, JSValue v1, JSValue v2) {
    return js_new_number(js_to_number(v1).as.number ^ js_to_number(v2).as.number);
}

JSValue js_binary_or(JSEnv* env, JSValue v1, JSValue v2) {
    return js_new_number(js_to_number(v1).as.number | js_to_number(v2).as.number);
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

JSValue js_call_function(JSEnv* env, JSValue v, JSValue this, List args) {
    if (v.type == TypeFunction) {
        return (v.as.function.function)(env, this, args, v.as.function.binding);
    } else {
        JSValue message = js_add(env, js_typeof(v), js_new_string(" is not a function."));
        JSValue exception = js_invoke_constructor(env, js_get_global(env, "TypeError"),
            list_insert(list_create(), message));
        js_throw(env, exception);
    }
}

JSValue js_call_method(JSEnv* env, JSValue object, JSValue key, List args) {
    object = js_to_object(env, object);
    JSValue function = js_get_property(env, object, key);
    if (function.type == TypeUndefined) {
        // TypeError: Object #{object} has no method '#{key}'
        JSValue message =
            js_add(env, js_new_string("Object "),
                js_add(env, js_to_string(env, object),
                    js_add(env, js_new_string(" has no method '"),
                        js_add(env, js_to_string(env, key), js_new_string("'"))
                    )
                )
            );
        JSValue exception = js_invoke_constructor(env, js_get_global(env, "TypeError"),
            list_insert(list_create(), message));
        js_throw(env, exception);
    }
    if (function.type != TypeFunction) {
        // TypeError: Property 'wtf' of object #<Object> is not a function
        JSValue message =
            js_add(env, js_new_string("Property '"),
                js_add(env, js_to_string(env, key),
                    js_add(env, js_new_string("' of object "),
                        js_add(env, js_to_string(env, object), js_new_string(" is not a function"))
                    )
                )
            );
        JSValue exception = js_invoke_constructor(env, js_get_global(env, "TypeError"),
            list_insert(list_create(), message));
        js_throw(env, exception);
    }
    return js_call_function(env, function, object, args);
}

JSValue js_invoke_constructor(JSEnv* env, JSValue function, List args) {
    JSValue this = js_new_object(env);
    JSValue constructor_prototype = object_get_property(function.as.function.as_object, "prototype");
    if (constructor_prototype.type == TypeObject) {
        this.as.object->prototype = constructor_prototype.as.object;
    } else {
        this.as.object = js_get_property(env, js_get_global(env, "Object"),
            js_new_string("prototype")).as.object;
    }
    JSValue ret = js_call_function(env, function, this, args);
    if (ret.type == TypeObject) {
        return ret;
    } else {
        return this;
    }
}

// --- variables --------------------------------------------------------------

JSVariable js_create_variable(JSValue value) {
    JSVariable var = malloc(sizeof(JSValue));
    *var = value;
    return var;
}

JSValue js_assign_variable(JSEnv* env, Dict binding, char* name, JSValue value) {
    JSVariable variable = dict_find(binding, name);
    if (variable != NULL) {
        *variable = value;
    } else {
        object_set_property(env->global.as.object, name, value);
    }
    return value;
}

JSValue js_get_variable_rvalue(JSEnv* env, Dict binding, char* name) {
    JSVariable variable = dict_find(binding, name);
    if (variable != NULL) {
        return *variable;
    } else {
        JSValueDict global_property = object_find_property(env->global.as.object, name);
        if (global_property) {
            return global_property->value;
        } else {
            JSValue message = js_add(env, js_new_string(name), js_new_string(" is not defined."));
            JSValue exception = js_invoke_constructor(env, js_get_global(env, "ReferenceError"),
                list_insert(list_create(), message));
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

// --- objects' properties ----------------------------------------------------

static JSValueDict object_find_property(JSObject* object, char* key) {
    JSValueDict dict = object->properties;
    while (dict != NULL) {
        if (strcmp(dict->key, key) == 0) {
            return dict;
        } else {
            dict = dict->next;
        }
    }
    return NULL;
}

static int object_has_own_property(JSObject* object, char* key) {
    return !! object_find_property(object, key);
}

static JSValue object_get_own_property(JSObject* object, char* key) {
    JSValueDict dict = object_find_property(object, key);
    if (dict != NULL) {
        return dict->value;
    } else {
        return js_new_undefined();
    }
}

static JSValue object_get_property(JSObject* object, char* key) {
    while (object != NULL) {
        JSValueDict dict = object_find_property(object, key);
        if (dict != NULL) {
            return dict->value;
        } else {
            object = object->prototype;
        }
    }
    return js_new_undefined();
}

static void object_add_property(JSObject* object, char* key, JSValue value) {
    struct JSValueDictElem* new_dict = malloc(sizeof(struct JSValueDictElem));
    new_dict->key = key;
    new_dict->value = value;
    new_dict->next = object->properties;
    object->properties = new_dict;
}

static void object_set_property(JSObject* object, char* key, JSValue value) {
    JSValueDict dict = object_find_property(object, key);;
    if (dict != NULL) {
        dict->value = value;
        return;
    } else {
        object_add_property(object, key, value);
    }
}

JSValue js_get_property(JSEnv* env, JSValue value, JSValue key) {
    key = js_to_string(env, key);
    switch (value.type) {
        case TypeUndefined:
            // TypeError: Cannot read property '#{key}' of undefined
            {
                JSValue message =
                    js_add(env, js_new_string("Cannot read property '"),
                        js_add(env, key, js_new_string("' of undefined")));
                JSValue exception = js_invoke_constructor(env, js_get_global(env, "TypeError"),
                    list_insert(list_create(), message));
                js_throw(env, exception);
            }
            break;
        case TypeNumber:
            return js_get_property(env, js_to_object(env, value), key);
        case TypeString:
            if (strcmp(key.as.string, "length") == 0) {
                return js_new_number(strlen(value.as.string));
            } else {
                return js_get_property(env, js_to_object(env, value), key);
            }
        case TypeBoolean:
            return js_get_property(env, js_to_object(env, value), key);
        case TypeObject:
            return object_get_property(value.as.object, key.as.string);
        case TypeFunction:
            return object_get_property(value.as.function.as_object, key.as.string);
    }
}

JSValue js_set_property(JSEnv* env, JSValue object, JSValue key, JSValue value) {
    object_set_property(js_to_object(env, object).as.object, js_to_string(env, key).as.string, value);
    return value;
}

JSValue js_add_property(JSEnv* env, JSValue object, JSValue key, JSValue value) {
    object_set_property(js_to_object(env, object).as.object, js_to_string(env, key).as.string, value);
    return object;
}

JSValue js_get_global(JSEnv* env, char* key) {
    return object_get_property(env->global.as.object, key);
}

// --- built-in objects -------------------------------------------------------

JSValue js_object_constructor(JSEnv* env, JSValue this, List argValues, Dict binding) {
    return js_new_object(env);
}

JSValue js_object_is_prototype_of(JSEnv* env, JSValue this, List argValues, Dict binding) {
    if (list_is_empty(argValues)) return js_new_boolean(0);
    JSValue object_value = list_head(argValues);
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

JSValue js_object_has_own_property(JSEnv* env, JSValue this, List argValues, Dict binding) {
    JSValue key = js_to_string(env, (JSValue) list_head(argValues));
    this = js_to_object(env, this);
    return js_new_boolean(object_has_own_property(this.as.object, key.as.string));
}

JSValue js_function_constructor(JSEnv* env, JSValue this, List argValues, Dict binding) {
    js_throw(env, js_new_string("Cannot use Function constructor in compiled code."));
}

JSValue js_function_prototype_call(JSEnv* env, JSValue this, List argValues, Dict binding) {
    JSValue new_this;
    if (list_is_empty(argValues)) {
        new_this = js_new_undefined();
    } else {
        new_this = list_head(argValues);
    }
    return js_call_function(env, this.as.object->primitive, new_this, list_tail(argValues));
}

JSValue js_function_prototype_apply(JSEnv* env, JSValue this, List argValues, Dict binding) {
    JSValue new_this;
    if (list_is_empty(argValues)) {
        new_this = js_new_undefined();
    } else {
        new_this = list_head(argValues);
    }
    List new_args = list_create();
    if (list_tail(argValues)) {
        JSValue args_obj = (JSValue) list_head(list_tail(argValues));
        if (args_obj.type == TypeObject) {
            // FIXME will fail if "length" does not exist or is not number
            int i, length = object_get_property(args_obj.as.object, "length").as.number;
            for (i = length - 1; i >= 0; i--) {
                JSValue arg_value = js_get_property(env, args_obj, js_new_number(i));
                new_args = list_insert(new_args, arg_value);
            }
        }
    }
    return js_call_function(env, this.as.object->primitive, new_this, new_args);
}

JSValue js_array_constructor(JSEnv* env, JSValue this, List argValues, Dict binding) {
    int i = 0;
    while (argValues != NULL) {
        object_set_property(this.as.object,
            js_to_string(env, js_new_number(i)).as.string, list_head(argValues));
        argValues = list_tail(argValues);
        i++;
    }
    object_set_property(this.as.object, "length", js_new_number(i));
    return this;
}

JSValue js_number_constructor(JSEnv* env, JSValue this, List argValues, Dict binding) {
    this.as.object->primitive = list_head(argValues);
    return this;
}

JSValue js_number_value_of(JSEnv* env, JSValue this, List argValues, Dict binding) {
    return this.as.object->primitive;
}

JSValue js_number_to_string(JSEnv* env, JSValue this, List argValues, Dict binding) {
    return js_to_string(env, js_number_value_of(env, this, argValues, binding));
}

JSValue js_string_constructor(JSEnv* env, JSValue this, List argValues, Dict binding) {
    this.as.object->primitive = list_head(argValues);
    object_set_property(this.as.object, "length",
        js_get_property(env, this.as.object->primitive, js_new_string("length")));
    return this;
}

JSValue js_string_value_of(JSEnv* env, JSValue this, List argValues, Dict binding) {
    return this.as.object->primitive;
}

JSValue js_string_to_string(JSEnv* env, JSValue this, List argValues, Dict binding) {
    return js_string_value_of(env, this, argValues, binding);
}

JSValue js_string_char_at(JSEnv* env, JSValue this, List argValues, Dict binding) {
    int i = js_to_number(list_head(argValues)).as.number;
    this = js_to_string(env, this);

    if (i < 0 || i >= strlen(this.as.string)) {
        return js_new_undefined();
    } else {
        char* s = malloc(sizeof(char) * 2);
        s[0] = this.as.string[i];
        s[1] = '\0';
        return js_new_string(s);
    }
}

JSValue js_string_substring(JSEnv* env, JSValue this, List argValues, Dict binding) {
    char* string = js_string_value_of(env, this, NULL, NULL).as.string;
    int from = js_to_number((JSValue) list_head(argValues)).as.number;
    int to = js_to_number((JSValue) list_head(list_tail(argValues))).as.number;
    int len = strlen(string);

    if (to > len) {
        to = len;
    }

    int new_len = to - from;
    char* cstr = malloc(sizeof(char) * (new_len + 1));
    memcpy(cstr, string + from, new_len);
    cstr[new_len] = '\0';

    return js_new_string(cstr);
}

JSValue js_string_index_of(JSEnv* env, JSValue this, List argValues, Dict binding) {
    char *string = js_to_string(env, this).as.string;
    int i = 0, j;
    JSValue js_substring, js_position;
    if (list_is_empty(argValues)) {
        js_substring = js_new_undefined();
    } else {
        js_substring = list_head(argValues);
        argValues = list_tail(argValues);
    }
    if (list_is_empty(argValues)) {
        js_position = js_new_undefined();
    } else {
        js_position = list_head(argValues);
        i = js_to_number(js_position).as.number;
    }
    char *substring = js_to_string(env, js_substring).as.string;
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

JSValue js_string_slice(JSEnv* env, JSValue this, List argValues, Dict binding) {
    int start = js_to_number(list_head(argValues)).as.number;
    this = js_to_string(env, this);
    return js_new_string(this.as.string + start);
}

JSValue js_console_log(JSEnv* env, JSValue this, List argValues, Dict binding) {
    printf("%s\n", js_to_string(env, list_head(argValues)).as.string);
    return js_new_undefined();
}

JSValue js_read_file(JSEnv* env, JSValue this, List argValues, Dict binding) {
    char* file_name = js_to_string(env, list_head(argValues)).as.string;
    FILE *fp = fopen(file_name, "rb");
    if (fp == NULL) js_throw(env, js_new_string("Cannot open file"));

    fseek(fp, 0, SEEK_END);
    int size = ftell(fp);
    fseek(fp, 0, SEEK_SET);

    char* contents = malloc(sizeof(char) * (size + 1));
    fread(contents, 1, size, fp);
    fclose(fp);
    contents[size] = '\0';
    return js_new_string(contents);
}

void js_create_native_objects(JSEnv* env) {
    JSValue global = env->global;
    js_set_property(env, global, js_new_string("global"), global);

    JSValue object_prototype = js_new_bare_object();
    JSValue object_constructor = js_new_bare_function(&js_object_constructor, NULL);
    object_constructor.as.function.as_object = malloc(sizeof(JSObject));
    object_constructor.as.function.as_object->properties = NULL;
    object_constructor.as.function.as_object->prototype = NULL;
    js_set_property(env, object_constructor, js_new_string("prototype"), object_prototype);
    js_set_property(env, global, js_new_string("Object"), object_constructor);

    JSValue function_constructor = js_new_bare_function(&js_function_constructor, NULL);
    JSValue function_prototype = js_new_object(env);
    function_constructor.as.function.as_object = malloc(sizeof(JSObject));
    function_constructor.as.function.as_object->properties = NULL;
    function_constructor.as.function.as_object->prototype = js_get_property(env,
        js_get_property(env, global, js_new_string("Object")), js_new_string("prototype")).as.object;
    js_set_property(env, function_constructor, js_new_string("prototype"), function_prototype);
    js_set_property(env, global, js_new_string("Function"), function_constructor);
    js_set_property(env, function_prototype, js_new_string("call"),
        js_new_function(env, &js_function_prototype_call, NULL));
    js_set_property(env, function_prototype, js_new_string("apply"),
        js_new_function(env, &js_function_prototype_apply, NULL));

    js_set_property(env, object_prototype, js_new_string("isPrototypeOf"),
        js_new_function(env, &js_object_is_prototype_of, NULL));
    js_set_property(env, object_prototype, js_new_string("hasOwnProperty"),
        js_new_function(env, &js_object_has_own_property, NULL));

    JSValue array_constructor = js_new_function(env, &js_array_constructor, NULL);
    js_set_property(env, global, js_new_string("Array"), array_constructor);

    JSValue number_constructor = js_new_function(env, &js_number_constructor, NULL);
    JSValue number_prototype = js_get_property(env, number_constructor, js_new_string("prototype"));
    js_set_property(env, global, js_new_string("Number"), number_constructor);
    js_set_property(env, number_prototype, js_new_string("valueOf"), js_new_function(env, &js_number_value_of, NULL));
    js_set_property(env, number_prototype, js_new_string("toString"), js_new_function(env, &js_number_to_string, NULL));

    JSValue string_constructor = js_new_function(env, &js_string_constructor, NULL);
    JSValue string_prototype = js_get_property(env, string_constructor, js_new_string("prototype"));
    js_set_property(env, global, js_new_string("String"), string_constructor);
    js_set_property(env, string_prototype, js_new_string("valueOf"), js_new_function(env, &js_string_value_of, NULL));
    js_set_property(env, string_prototype, js_new_string("toString"), js_new_function(env, &js_string_to_string, NULL));
    js_set_property(env, string_prototype, js_new_string("charAt"), js_new_function(env, &js_string_char_at, NULL));
    js_set_property(env, string_prototype, js_new_string("substring"), js_new_function(env, &js_string_substring, NULL));
    js_set_property(env, string_prototype, js_new_string("indexOf"), js_new_function(env, &js_string_index_of, NULL));
    js_set_property(env, string_prototype, js_new_string("slice"), js_new_function(env, &js_string_slice, NULL));

    JSValue console = js_new_object(env);
    js_set_property(env, console, js_new_string("log"), js_new_function(env, &js_console_log, NULL));
    js_set_property(env, global, js_new_string("console"), console);

    js_set_property(env, global, js_new_string("readFileSync"), js_new_function(env, &js_read_file, NULL));
}
