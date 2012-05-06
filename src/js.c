#include <stdlib.h>
#include <string.h>
#include <setjmp.h>
#include "dict.c"
#include "list.c"

enum JSType {
    TypeUndefined,
    TypeNumber,
    TypeString,
    TypeBoolean,
    TypeFunction,
    TypeObject
};

typedef struct TJSObject {
    Dict properties;
    struct TJSObject* prototype;
} JSObject;

typedef struct {
    struct TJSValue* (*function)();
    Dict binding;
} JSClosure;

typedef struct TJSValue {
    enum JSType type;
    int as_number;
    char* as_string;
    char as_boolean;
    JSObject* as_object;
    JSClosure as_function;
} JSValue;

typedef JSValue** JSVariable;

#define JS_EXCEPTION_STACK_SIZE 1024

typedef struct {
    jmp_buf jmp;
    JSValue* value;
} JSException;

typedef struct {
    JSValue* global;
    JSException exceptions[JS_EXCEPTION_STACK_SIZE];
    unsigned int exceptions_count;
} JSEnv;

JSValue* js_new_bare_function(JSValue* (*function_ptr)(), Dict binding);
void js_throw(JSEnv* env, JSValue* exception);
JSValue* js_call_method(JSEnv* env, JSValue* object, JSValue* key, List args);
JSValue* js_invoke_constructor(JSEnv* env, JSValue* function, List args);

static JSValue* object_get_own_property(JSObject* object, char* key);
static JSValue* object_get_property(JSObject* object, char* key);
static void object_set_property(JSObject* object, char* key, JSValue* value);

JSValue* js_get_property(JSEnv* env, JSValue* value, JSValue* key);
JSValue* js_set_property(JSEnv* env, JSValue* object, JSValue* key, JSValue* value);
JSValue* js_get_global(JSEnv* env, char* key);


// TODO remove
void js_dump_value(JSValue* v)
{
    switch (v->type) {
        case TypeNumber:
            printf("%d", v->as_number);
            break;
        case TypeString:
            printf("%s", v->as_string);
            break;
        case TypeBoolean:
            if (v->as_boolean) {
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

JSValue* js_new_number(int n) {
    JSValue* v = malloc(sizeof(JSValue));
    v->type = TypeNumber;
    v->as_number = n;
    return v;
}

JSValue* js_new_string(char* s) {
    JSValue* v = malloc(sizeof(JSValue));
    v->type = TypeString;
    v->as_string = s;
    return v;
}

JSValue* js_new_boolean(char i) {
    JSValue* v = malloc(sizeof(JSValue));
    v->type = TypeBoolean;
    v->as_boolean = i;
    return v;
}

JSValue* js_new_bare_object() {
    JSValue* v = malloc(sizeof(JSValue));
    v->type = TypeObject;
    v->as_object = malloc(sizeof(JSObject));
    v->as_object->properties = NULL;
    v->as_object->prototype = NULL;
    return v;
}

JSValue* js_new_object(JSEnv* env, Dict d) {
    JSValue* v = js_new_bare_object();
    v->as_object->properties = d;
    v->as_object->prototype =
        js_get_property(env, js_get_global(env, "Object"), js_new_string("prototype"))->as_object;
    return v;
}

JSValue* js_new_bare_function(JSValue* (*function_ptr)(), Dict binding) {
    JSValue* v = malloc(sizeof(JSValue));
    v->type = TypeFunction;
    JSClosure closure;
    closure.function = function_ptr;
    closure.binding = binding;
    v->as_function = closure;
    return v;
}

JSValue* js_new_function(JSEnv* env, JSValue* (*function_ptr)(), Dict binding) {
    JSValue* v = js_new_bare_function(function_ptr, binding);

    // function is also an object, initialize properties dictionary
    v->as_object = malloc(sizeof(JSObject));
    v->as_object->properties = dict_create();
    v->as_object->prototype =
        js_get_property(env, js_get_global(env, "Function"), js_new_string("prototype"))->as_object;

    // every function has a prototype object for instances
    JSValue* prototype = js_new_object(env, dict_insert(dict_create(), "constructor", v));
    v->as_object->properties =
        dict_insert(v->as_object->properties, "prototype", prototype);

    return v;
}

JSValue* js_new_undefined() {
    JSValue* v = malloc(sizeof(JSValue));
    v->type = TypeUndefined;
    return v;
}

JSValue* js_new_null() {
    JSValue* v = malloc(sizeof(JSValue));
    v->type = TypeObject;
    v->as_object = NULL;
    return v;
}

// --- conversions ------------------------------------------------------------

JSValue* js_to_string(JSEnv* env, JSValue* v) {
    if (v->type == TypeString) {
        return v;
    } else if (v->type == TypeNumber) {
        char len = 1;
        int a = v->as_number;
        if (a < 0) { a = -a; len++; }
        do { len++; a = a / 10; } while (a > 0);
        char* s = malloc(sizeof(char) * len);
        snprintf(s, len, "%d", v->as_number);
        return js_new_string(s);
    } else if (v->type == TypeObject) {
        JSValue* to_string = object_get_property(v->as_object, "toString");
        if (to_string && to_string->type == TypeFunction) {
            return js_call_method(env, v, js_new_string("toString"), list_create());
        } else {
            return js_new_string("[object]");
        }
    } else if (v->type == TypeFunction) {
        return js_new_string("[function]");
    } else {
        fprintf(stderr, "Cannot convert to string");
        exit(1);
    }
}

JSValue* js_to_number(JSValue* v) {
    if (v->type == TypeNumber) {
        return v;
    } else if (v->type == TypeBoolean) {
        return js_new_number(v->as_boolean);
    } else {
        fprintf(stderr, "Cannot convert to number");
        exit(1);
    }
}

JSValue* js_to_boolean(JSValue* v) {
    switch (v->type) {
        case TypeNumber:
            return js_new_boolean(v->as_number != 0);
        case TypeString:
            return js_new_boolean(strlen(v->as_string) > 0);
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

JSValue* js_to_object(JSEnv* env, JSValue* v) {
    if (v->type == TypeObject || v->type == TypeFunction) {
        return v;
    } else if (v->type == TypeNumber) {
        return js_invoke_constructor(env, js_get_global(env, "Number"),
            list_insert(list_create(), v));
    } else if (v->type == TypeString) {
        return js_invoke_constructor(env, js_get_global(env, "String"),
            list_insert(list_create(), v));
    } else {
        fprintf(stderr, "Cannot convert to object");
        exit(1);
    }
}

// TODO replace with js_to_boolean
int js_is_truthy(JSValue* v) {
    switch (v->type) {
        case TypeNumber:
            return v->as_number != 0;
        case TypeString:
            return strlen(v->as_string) > 0;
        case TypeBoolean:
            return v->as_boolean;
        case TypeObject:
            return v->as_object != NULL;
        case TypeFunction:
            return 1;
        case TypeUndefined:
            return 0;
    }
}

// --- operators --------------------------------------------------------------

JSValue* js_typeof(JSValue* v) {
    switch (v->type) {
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

JSValue* js_instanceof(JSEnv* env, JSValue* left, JSValue* right) {
    if (left->type != TypeObject) {
        return js_new_boolean(0);
    }
    if (right->type != TypeFunction) {
        js_throw(env, js_new_string("TypeError"));
    }
    JSValue* constructor_prototype = object_get_property(right->as_object, "prototype");
    if (constructor_prototype->type != TypeObject) {
        js_throw(env, js_new_string("TypeError"));
    }
    JSObject* object = left->as_object;

    while (object != NULL) {
        if (object->prototype == constructor_prototype->as_object) {
            return js_new_boolean(1);
        } else {
            object = object->prototype;
        }
    }
    return js_new_boolean(0);
}

JSValue* js_add(JSEnv* env, JSValue* v1, JSValue* v2) {
    if (v1->type == TypeString || v2->type == TypeString) {
        char* str1 = js_to_string(env, v1)->as_string;
        char* str2 = js_to_string(env, v2)->as_string;

        char* new_string = malloc(sizeof(char) * (strlen(str1) + strlen(str2) + 1));
        strcpy(new_string, str1);
        strcat(new_string, str2);
        return js_new_string(new_string);
    } else {
        return js_new_number(js_to_number(v1)->as_number + js_to_number(v2)->as_number);
    }
}

JSValue* js_sub(JSEnv* env, JSValue* v1, JSValue* v2) {
    return js_new_number(js_to_number(v1)->as_number - js_to_number(v2)->as_number);
}

JSValue* js_mult(JSEnv* env, JSValue* v1, JSValue* v2) {
    return js_new_number(v1->as_number * v2->as_number);
}

JSValue* js_strict_eq(JSEnv* env, JSValue* v1, JSValue* v2) {
    if (v1->type != v2->type) {
        return js_new_boolean(0);
    }
    switch (v1->type) {
        case TypeNumber:
            return js_new_boolean(v1->as_number == v2->as_number);
        case TypeString:
            return js_new_boolean(strcmp(v1->as_string, v2->as_string) == 0);
        case TypeBoolean:
            return js_new_boolean(v1->as_boolean == v2->as_boolean);
        case TypeObject:
            return js_new_boolean(v1->as_object == v2->as_object);
        case TypeFunction:
            return js_new_boolean(v1->as_function.function == v2->as_function.function
                && v1->as_function.binding == v2->as_function.binding);
        case TypeUndefined:
            return js_new_boolean(1);
    }
}

JSValue* js_strict_neq(JSEnv* env, JSValue* v1, JSValue* v2) {
    return js_new_boolean(! js_strict_eq(env, v1, v2)->as_boolean);
}

JSValue* js_eq(JSEnv* env, JSValue* v1, JSValue* v2) {
    return js_strict_eq(env, v1, v2);
}

JSValue* js_neq(JSEnv* env, JSValue* v1, JSValue* v2) {
    return js_strict_neq(env, v1, v2);
}

JSValue* js_lt(JSEnv* env, JSValue* v1, JSValue* v2) {
    return js_new_boolean(js_to_number(v1)->as_number < js_to_number(v2)->as_number);
}

JSValue* js_gt(JSEnv* env, JSValue* v1, JSValue* v2) {
    return js_new_boolean(js_to_number(v1)->as_number > js_to_number(v2)->as_number);
}

JSValue* js_binary_and(JSEnv* env, JSValue* v1, JSValue* v2) {
    return js_new_number(js_to_number(v1)->as_number & js_to_number(v2)->as_number);
}

JSValue* js_binary_xor(JSEnv* env, JSValue* v1, JSValue* v2) {
    return js_new_number(js_to_number(v1)->as_number ^ js_to_number(v2)->as_number);
}

JSValue* js_binary_or(JSEnv* env, JSValue* v1, JSValue* v2) {
    return js_new_number(js_to_number(v1)->as_number | js_to_number(v2)->as_number);
}

JSValue* js_logical_and(JSEnv* env, JSValue* v1, JSValue* v2) {
    if (js_is_truthy(js_to_boolean(v1))) {
        return v2;
    } else {
        return v1;
    }
}

JSValue* js_logical_or(JSEnv* env, JSValue* v1, JSValue* v2) {
    if (js_is_truthy(js_to_boolean(v1))) {
        return v1;
    } else {
        return v2;
    }
}

// --- function calls ---------------------------------------------------------

JSValue* js_call_function(JSEnv* env, JSValue* v, JSValue* this, List args) {
    if (v->type == TypeFunction) {
        return (v->as_function.function)(env, this, args, v->as_function.binding);
    } else {
        JSValue* message = js_add(env, js_typeof(v), js_new_string(" is not a function."));
        JSValue* exception = js_invoke_constructor(env, js_get_global(env, "TypeError"),
            list_insert(list_create(), message));
        js_throw(env, exception);
    }
}

JSValue* js_call_method(JSEnv* env, JSValue* object, JSValue* key, List args) {
    JSValue* function = js_get_property(env, object, key);
    if (function->type == TypeUndefined) {
        // TypeError: Object #{object} has no method '#{key}'
        JSValue* message =
            js_add(env, js_new_string("Object "),
                js_add(env, js_to_string(env, object),
                    js_add(env, js_new_string(" has no method '"),
                        js_add(env, js_to_string(env, key), js_new_string("'"))
                    )
                )
            );
        JSValue* exception = js_invoke_constructor(env, js_get_global(env, "TypeError"),
            list_insert(list_create(), message));
        js_throw(env, exception);
    }
    if (function->type != TypeFunction) {
        // TypeError: Property 'wtf' of object #<Object> is not a function
        JSValue* message =
            js_add(env, js_new_string("Property '"),
                js_add(env, js_to_string(env, key),
                    js_add(env, js_new_string("' of object "),
                        js_add(env, js_to_string(env, object), js_new_string(" is not a function"))
                    )
                )
            );
        JSValue* exception = js_invoke_constructor(env, js_get_global(env, "TypeError"),
            list_insert(list_create(), message));
        js_throw(env, exception);
    }
    return js_call_function(env, function, object, args);
}

JSValue* js_invoke_constructor(JSEnv* env, JSValue* function, List args) {
    JSValue* this = js_new_object(env, dict_create());
    JSValue* constructor_prototype = dict_find(function->as_object->properties, "prototype");
    if (constructor_prototype && constructor_prototype->type == TypeObject) {
        this->as_object->prototype = constructor_prototype->as_object;
    } else {
        this->as_object = js_get_property(env, js_get_global(env, "Object"),
            js_new_string("prototype"))->as_object;
    }
    JSValue* ret = js_call_function(env, function, this, args);
    if (ret->type == TypeObject) {
        return ret;
    } else {
        return this;
    }
}

// --- variables --------------------------------------------------------------

JSVariable js_create_variable(JSValue* value) {
    JSVariable var = malloc(sizeof(JSValue*));
    *var = value;
    return var;
}

JSValue* js_assign_variable(JSEnv* env, Dict binding, char* name, JSValue* value) {
    JSVariable variable = dict_find(binding, name);
    if (variable != NULL) {
        *variable = value;
    } else {
        object_set_property(env->global->as_object, name, value);
    }
    return value;
}

JSValue* js_get_variable_rvalue(JSEnv* env, Dict binding, char* name) {
    JSVariable variable = dict_find(binding, name);
    if (variable != NULL) {
        return *variable;
    } else {
        JSValue* global_value = dict_find(env->global->as_object->properties, name);
        if (global_value) {
            return global_value;
        } else {
            JSValue* message = js_add(env, js_new_string(name), js_new_string(" is not defined."));
            JSValue* exception = js_invoke_constructor(env, js_get_global(env, "ReferenceError"),
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

void js_throw(JSEnv* env, JSValue* value) {
    JSException* exc = js_last_exception(env);
    exc->value = value;
    longjmp(exc->jmp, 1);
}

// --- objects' properties ----------------------------------------------------

static JSValue* object_get_own_property(JSObject* object, char* key) {
    return (JSValue*) dict_find_with_default(object->properties, key, js_new_undefined());
}

static JSValue* object_get_property(JSObject* object, char* key) {
    while (object != NULL) {
        JSValue* value = (JSValue*) dict_find(object->properties, key);
        if (value) {
            return value;
        } else {
            object = object->prototype;
        }
    }
    return js_new_undefined();
}

static void object_set_property(JSObject* object, char* key, JSValue* value) {
    object->properties = dict_insert(object->properties, key, value);
}

JSValue* js_get_property(JSEnv* env, JSValue* value, JSValue* key) {
    key = js_to_string(env, key);
    switch (value->type) {
        case TypeUndefined:
            // TypeError: Cannot read property '#{key}' of undefined
            {
                JSValue* message =
                    js_add(env, js_new_string("Cannot read property '"),
                        js_add(env, key, js_new_string("' of undefined")));
                JSValue* exception = js_invoke_constructor(env, js_get_global(env, "TypeError"),
                    list_insert(list_create(), message));
                js_throw(env, exception);
            }
            break;
        case TypeNumber:
            return js_get_property(env, js_to_object(env, value), key);
        case TypeString:
            if (strcmp(key->as_string, "length") == 0) {
                return js_new_number(strlen(value->as_string));
            } else {
                return js_get_property(env, js_to_object(env, value), key);
            }
        case TypeBoolean:
            return js_get_property(env, js_to_object(env, value), key);
        case TypeObject:
        case TypeFunction:
            return object_get_property(value->as_object, key->as_string);
    }
}

JSValue* js_set_property(JSEnv* env, JSValue* object, JSValue* key, JSValue* value) {
    object_set_property(js_to_object(env, object)->as_object, js_to_string(env, key)->as_string, value);
    return value;
}

JSValue* js_get_global(JSEnv* env, char* key) {
    return object_get_property(env->global->as_object, key);
}

// --- built-in objects -------------------------------------------------------

JSValue* js_object_constructor(JSEnv* env, JSValue* this, List argValues, Dict binding) {
    return js_new_object(env, NULL);
}

JSValue* js_object_is_prototype_of(JSEnv* env, JSValue* this, List argValues, Dict binding) {
    JSValue* as_object = (JSValue*) list_head(argValues);
    if (!as_object || as_object->type != TypeObject) return js_new_boolean(0);
    JSObject* object = as_object->as_object;
    this = js_to_object(env, this);

    while (object != NULL) {
        if (object->prototype == this->as_object) {
            return js_new_boolean(1);
        }
        object = object->prototype;
    }
    return js_new_boolean(0);
}

JSValue* js_object_has_own_property(JSEnv* env, JSValue* this, List argValues, Dict binding) {
    JSValue* key = js_to_string(env, (JSValue*) list_head(argValues));
    this = js_to_object(env, this);
    Dict property = this->as_object->properties;
    while (property) {
        if (strcmp(property->key, key->as_string) == 0) {
            return js_new_boolean(1);
        }
        property = property->next;
    }
    return js_new_boolean(0);
}

JSValue* js_function_constructor(JSEnv* env, JSValue* this, List argValues, Dict binding) {
    js_throw(env, js_new_string("Cannot use Function constructor in compiled code."));
}

JSValue* js_function_prototype_call(JSEnv* env, JSValue* this, List argValues, Dict binding) {
    JSValue* new_this = list_head(argValues);
    if (new_this == NULL) {
        new_this = js_new_undefined();
    }
    return js_call_function(env, this, new_this, list_tail(argValues));
}

JSValue* js_function_prototype_apply(JSEnv* env, JSValue* this, List argValues, Dict binding) {
    JSValue* new_this = list_head(argValues);
    if (new_this == NULL) {
        new_this = js_new_undefined();
    }
    List new_args = list_create();
    if (list_tail(argValues)) {
        JSValue* args_obj = (JSValue*) list_head(list_tail(argValues));
        if (args_obj->type == TypeObject) {
            // FIXME will fail if "length" does not exist or is not number
            int i, length = object_get_property(args_obj->as_object, "length")->as_number;
            for (i = length - 1; i >= 0; i--) {
                JSValue* arg_value = js_get_property(env, args_obj, js_new_number(i));
                new_args = list_insert(new_args, arg_value);
            }
        }
    }
    return js_call_function(env, this, new_this, new_args);
}

JSValue* js_array_constructor(JSEnv* env, JSValue* this, List argValues, Dict binding) {
    int i = 0;
    while (argValues != NULL) {
        object_set_property(this->as_object,
            js_to_string(env, js_new_number(i))->as_string, list_head(argValues));
        argValues = list_tail(argValues);
        i++;
    }
    object_set_property(this->as_object, "length", js_new_number(i));
    return this;
}

JSValue* js_number_constructor(JSEnv* env, JSValue* this, List argValues, Dict binding) {
    this->as_number = ((JSValue*) list_head(argValues))->as_number;
    return this;
}

JSValue* js_number_value_of(JSEnv* env, JSValue* this, List argValues, Dict binding) {
    return js_new_number(this->as_number);
}

JSValue* js_number_to_string(JSEnv* env, JSValue* this, List argValues, Dict binding) {
    return js_to_string(env, js_new_number(this->as_number));
}

JSValue* js_string_constructor(JSEnv* env, JSValue* this, List argValues, Dict binding) {
    this->as_string = ((JSValue*) list_head(argValues))->as_string;
    return this;
}

JSValue* js_string_value_of(JSEnv* env, JSValue* this, List argValues, Dict binding) {
    return js_new_string(this->as_string);
}

JSValue* js_string_to_string(JSEnv* env, JSValue* this, List argValues, Dict binding) {
    return js_new_string(this->as_string);
}

JSValue* js_string_char_at(JSEnv* env, JSValue* this, List argValues, Dict binding) {
    int i = js_to_number(list_head(argValues))->as_number;
    this = js_to_string(env, this);

    if (i < 0 || i >= strlen(this->as_string)) {
        return js_new_undefined();
    } else {
        char* s = malloc(sizeof(char) * 2);
        s[0] = this->as_string[i];
        s[1] = '\0';
        return js_new_string(s);
    }
}

JSValue* js_string_substring(JSEnv* env, JSValue* this, List argValues, Dict binding) {
    int from = js_to_number((JSValue*) list_head(argValues))->as_number;
    int to = js_to_number((JSValue*) list_head(list_tail(argValues)))->as_number;
    int len = strlen(this->as_string);

    if (to > len) {
        to = len;
    }

    int new_len = to - from;
    char* cstr = malloc(sizeof(char) * (new_len + 1));
    memcpy(cstr, this->as_string + from, new_len);
    cstr[new_len] = '\0';

    return js_new_string(cstr);
}

JSValue* js_string_index_of(JSEnv* env, JSValue* this, List argValues, Dict binding) {
    JSValue* js_substring = (JSValue*) list_head(argValues);
    JSValue* js_position = (JSValue*) list_head(list_tail(argValues));
    char *string = js_to_string(env, this)->as_string;
    int i = 0, j;

    if (js_substring == NULL) {
        js_substring = js_new_undefined();
    }
    char *substring = js_to_string(env, js_substring)->as_string;
    if (js_position != NULL) {
        i = js_to_number(js_position)->as_number;
    }
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

JSValue* js_string_slice(JSEnv* env, JSValue* this, List argValues, Dict binding) {
    int start = js_to_number(list_head(argValues))->as_number;
    this = js_to_string(env, this);
    return js_new_string(this->as_string + start);
}

JSValue* js_console_log(JSEnv* env, JSValue* this, List argValues, Dict binding) {
    printf("%s\n", js_to_string(env, list_head(argValues))->as_string);
    return js_new_undefined();
}

void js_create_native_objects(JSEnv* env) {
    JSValue* global = env->global;
    js_set_property(env, global, js_new_string("global"), global);

    JSValue* object_prototype = js_new_bare_object();
    JSValue* object_constructor = js_new_bare_function(&js_object_constructor, NULL);
    object_constructor->as_object = malloc(sizeof(JSObject));
    object_constructor->as_object->properties = dict_create();
    object_constructor->as_object->prototype = NULL;
    js_set_property(env, object_constructor, js_new_string("prototype"), object_prototype);
    js_set_property(env, global, js_new_string("Object"), object_constructor);

    JSValue* function_constructor = js_new_bare_function(&js_function_constructor, NULL);
    JSValue* function_prototype = js_new_object(env, dict_create());
    function_constructor->as_object = malloc(sizeof(JSObject));
    function_constructor->as_object->properties = dict_create();
    function_constructor->as_object->prototype = js_get_property(env,
        js_get_property(env, global, js_new_string("Object")), js_new_string("prototype"))->as_object;
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

    JSValue* array_constructor = js_new_function(env, &js_array_constructor, NULL);
    js_set_property(env, global, js_new_string("Array"), array_constructor);

    JSValue* number_constructor = js_new_function(env, &js_number_constructor, NULL);
    JSValue* number_prototype = js_get_property(env, number_constructor, js_new_string("prototype"));
    js_set_property(env, global, js_new_string("Number"), number_constructor);
    js_set_property(env, number_prototype, js_new_string("valueOf"), js_new_function(env, &js_number_value_of, NULL));
    js_set_property(env, number_prototype, js_new_string("toString"), js_new_function(env, &js_number_to_string, NULL));

    JSValue* string_constructor = js_new_function(env, &js_string_constructor, NULL);
    JSValue* string_prototype = js_get_property(env, string_constructor, js_new_string("prototype"));
    js_set_property(env, global, js_new_string("String"), string_constructor);
    js_set_property(env, string_prototype, js_new_string("valueOf"), js_new_function(env, &js_string_value_of, NULL));
    js_set_property(env, string_prototype, js_new_string("toString"), js_new_function(env, &js_string_to_string, NULL));
    js_set_property(env, string_prototype, js_new_string("charAt"), js_new_function(env, &js_string_char_at, NULL));
    js_set_property(env, string_prototype, js_new_string("substring"), js_new_function(env, &js_string_substring, NULL));
    js_set_property(env, string_prototype, js_new_string("indexOf"), js_new_function(env, &js_string_index_of, NULL));
    js_set_property(env, string_prototype, js_new_string("slice"), js_new_function(env, &js_string_slice, NULL));

    JSValue* console = js_new_object(env, NULL);
    js_set_property(env, console, js_new_string("log"), js_new_function(env, &js_console_log, NULL));
    js_set_property(env, global, js_new_string("console"), console);
}
