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

typedef struct {
    Dict properties;
    struct TJSValue* prototype;
} JSObject;

typedef struct {
    struct TJSValue* (*function)();
    Dict binding;
} JSClosure;

typedef struct TJSValue {
    enum JSType type;
    int number_value;
    char* string_value;
    char boolean_value;
    JSObject* object_value;
    // Dict object_value;
    JSClosure function_value;
    // struct TJSValue* prototype;
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
static JSValue* get_object_property(JSValue* object, char* key);
static void set_object_property(JSValue* object, char* key, JSValue* value);

void js_dump_value(JSValue* v)
{
    switch (v->type) {
        case TypeNumber:
            printf("%d", v->number_value);
            break;
        case TypeString:
            printf("%s", v->string_value);
            break;
        case TypeBoolean:
            if (v->boolean_value) {
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

JSValue* js_new_number(int n) {
    JSValue* v = malloc(sizeof(JSValue));
    v->type = TypeNumber;
    v->number_value = n;
    return v;
}

JSValue* js_new_string(char* s) {
    JSValue* v = malloc(sizeof(JSValue));
    v->type = TypeString;
    v->string_value = s;
    return v;
}

JSValue* js_new_boolean(char i) {
    JSValue* v = malloc(sizeof(JSValue));
    v->type = TypeBoolean;
    v->boolean_value = i;
    return v;
}

JSValue* js_new_bare_object() {
    JSValue* v = malloc(sizeof(JSValue));
    v->type = TypeObject;
    v->object_value = malloc(sizeof(JSObject));
    v->object_value->properties = NULL;
    v->object_value->prototype = NULL;
    return v;
}

JSValue* js_new_object(JSEnv* env, Dict d) {
    JSValue* v = js_new_bare_object();
    v->object_value->properties = d;
    v->object_value->prototype = get_object_property(get_object_property(env->global, "Object"), "prototype");
    set_object_property(v, "constructor", get_object_property(env->global, "Object"));
    return v;
}

JSValue* js_new_bare_function(JSValue* (*function_ptr)(), Dict binding) {
    JSValue* v = malloc(sizeof(JSValue));
    v->type = TypeFunction;
    JSClosure closure;
    closure.function = function_ptr;
    closure.binding = binding;
    v->function_value = closure;
    return v;
}

JSValue* js_new_function(JSEnv* env, JSValue* (*function_ptr)(), Dict binding) {
    JSValue* v = js_new_bare_function(function_ptr, binding);

    // function is also an object, initialize properties dictionary
    v->object_value = malloc(sizeof(JSObject));
    v->object_value->properties = dict_create();
    v->object_value->prototype = NULL;

    // every function has a prototype object for instances
    v->object_value->properties =
        dict_insert(v->object_value->properties, "prototype", js_new_object(env, dict_create()));

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
    v->object_value = NULL;
    return v;
}

JSValue* js_to_string(JSEnv* env, JSValue* v) {
    if (v->type == TypeString) {
        return v;
    } else if (v->type == TypeNumber) {
        char len = 1;
        int a = v->number_value;
        if (a < 0) { a = -a; len++; }
        do { len++; a = a / 10; } while (a > 0);
        char* s = malloc(sizeof(char) * len);
        snprintf(s, len, "%d", v->number_value);
        return js_new_string(s);
    } else if (v->type == TypeObject) {
        if (get_object_property(v, "toString")->type == TypeFunction) {
            return js_call_method(env, v, js_new_string("toString"), list_create());
        } else {
            return js_new_string("[object]");
        }
    } else {
        fprintf(stderr, "Cannot convert to string");
        exit(1);
    }
}

JSValue* js_to_number(JSValue* v) {
    if (v->type == TypeNumber) {
        return v;
    } else {
        fprintf(stderr, "Cannot convert to number");
        exit(1);
    }
}

JSValue* js_to_boolean(JSValue* v) {
    switch (v->type) {
        case TypeNumber:
            return js_new_boolean(v->number_value != 0);
        case TypeString:
            return js_new_boolean(strlen(v->string_value) > 0);
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
        return js_invoke_constructor(env, get_object_property(env->global, "Number"),
            list_insert(list_create(), v));
    } else {
        fprintf(stderr, "Cannot convert to object");
        exit(1);
    }
}

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

JSValue* js_instanceof(JSValue* object, JSValue* constructor) {
    if (object->type != TypeObject) {
        return js_new_boolean(0);
    }
    while (object != NULL) {
        if (get_object_property(object, "constructor") == constructor) {
            return js_new_boolean(1);
        } else {
            object = object->object_value->prototype;
        }
    }
    return js_new_boolean(0);
}

JSValue* js_add(JSValue* v1, JSValue* v2) {
    if (v1->type == TypeNumber && v2->type == TypeNumber) {
        return js_new_number(v1->number_value + v2->number_value);
    } else if (v1->type == TypeString && v2->type == TypeString) {
        char* new_string = malloc(sizeof(char) * (strlen(v1->string_value) + strlen(v2->string_value) + 1));
        strcpy(new_string, v1->string_value);
        strcat(new_string, v2->string_value);
        return js_new_string(new_string);
    } else {
        fprintf(stderr, "Cannot add");
        exit(1);
    }
}

JSValue* js_sub(JSValue* v1, JSValue* v2) {
    if (v1->type == TypeNumber && v2->type == TypeNumber) {
        return js_new_number(v1->number_value - v2->number_value);
    } else {
        fprintf(stderr, "Cannot subtract");
        exit(1);
    }
}

JSValue* js_mult(JSValue* v1, JSValue* v2) {
    return js_new_number(v1->number_value * v2->number_value);
}

JSValue* js_strict_eq(JSValue* v1, JSValue* v2) {
    if (v1->type != v2->type) {
        return js_new_boolean(0);
    }
    switch (v1->type) {
        case TypeNumber:
            return js_new_boolean(v1->number_value == v2->number_value);
        case TypeString:
            return js_new_boolean(strcmp(v1->string_value, v2->string_value) == 0);
        case TypeBoolean:
            return js_new_boolean(v1->boolean_value == v2->boolean_value);
        case TypeObject:
            return js_new_boolean(v1->object_value == v2->object_value);
        case TypeFunction:
            return js_new_boolean(v1->function_value.function == v2->function_value.function
                && v1->function_value.binding == v2->function_value.binding);
        case TypeUndefined:
            return js_new_boolean(1);
    }
}

JSValue* js_strict_neq(JSValue* v1, JSValue* v2) {
    return js_new_boolean(! js_strict_eq(v1, v2)->boolean_value);
}

JSValue* js_eq(JSValue* v1, JSValue* v2) {
    return js_strict_eq(v1, v2);
}

JSValue* js_neq(JSValue* v1, JSValue* v2) {
    return js_strict_neq(v1, v2);
}

JSValue* js_lt(JSValue* v1, JSValue* v2) {
    return js_new_boolean(js_to_number(v1)->number_value < js_to_number(v2)->number_value);
}

JSValue* js_gt(JSValue* v1, JSValue* v2) {
    return js_new_boolean(js_to_number(v1)->number_value > js_to_number(v2)->number_value);
}

int js_is_truthy(JSValue* v) {
    switch (v->type) {
        case TypeNumber:
            return v->number_value != 0;
        case TypeString:
            return strlen(v->string_value) > 0;
        case TypeBoolean:
            return v->boolean_value;
        case TypeObject:
            return v->object_value != NULL;
        case TypeFunction:
            return 1;
        case TypeUndefined:
            return 0;
    }
}

JSValue* js_logical_and(JSValue* v1, JSValue* v2) {
    if (js_is_truthy(js_to_boolean(v1))) {
        return v2;
    } else {
        return v1;
    }
}

JSValue* js_logical_or(JSValue* v1, JSValue* v2) {
    if (js_is_truthy(js_to_boolean(v1))) {
        return v1;
    } else {
        return v2;
    }
}

JSValue* js_call_function(JSEnv* env, JSValue* v, JSValue* this, List args) {
    if (v->type == TypeFunction) {
        return (v->function_value.function)(env, this, args, v->function_value.binding);
    } else {
        JSValue* message = js_add(js_typeof(v), js_new_string(" is not a function."));
        JSValue* exception = js_invoke_constructor(env, get_object_property(env->global, "TypeError"),
            list_insert(list_create(), message));
        js_throw(env, exception);
    }
}

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
        set_object_property(env->global, name, value);
    }
    return value;
}

JSValue* js_get_variable_rvalue(JSEnv* env, Dict binding, char* name) {
    JSVariable variable = dict_find(binding, name);
    if (variable != NULL) {
        return *variable;
    } else {
        JSValue* global_value = dict_find(env->global->object_value->properties, name);
        if (global_value) {
            return global_value;
        } else {
            JSValue* message = js_add(js_new_string(name), js_new_string(" is not defined."));
            JSValue* exception = js_invoke_constructor(env, get_object_property(env->global, "ReferenceError"),
                list_insert(list_create(), message));
            js_throw(env, exception);
        }
    }
}

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

static JSValue* get_object_property(JSValue* object, char* key) {
    while (object != NULL) {
        JSValue* value = (JSValue*) dict_find_with_default(
            object->object_value->properties, key, js_new_undefined());
        if (value->type != TypeUndefined) {
            return value;
        } else {
            object = object->object_value->prototype;
        }
    }
    return js_new_undefined();
}

static void set_object_property(JSValue* object, char* key, JSValue* value) {
    object->object_value->properties =
        dict_insert(object->object_value->properties, key, value);
}

JSValue* js_get_object_property(JSEnv* env, JSValue* object, JSValue* key) {
    return get_object_property(object, js_to_string(env, key)->string_value);
}

JSValue* js_set_object_property(JSEnv* env, JSValue* object, JSValue* key, JSValue* value) {
    set_object_property(js_to_object(env, object), js_to_string(env, key)->string_value, value);
    return value;
}

JSValue* js_call_method(JSEnv* env, JSValue* object, JSValue* key, List args) {
    return js_call_function(env, js_get_object_property(env, object, key), object, args);
}

JSValue* js_invoke_constructor(JSEnv* env, JSValue* function, List args) {
    JSValue* this = js_new_object(env, dict_create());
    this->object_value->prototype = dict_find(function->object_value->properties, "prototype");
    set_object_property(this, "constructor", function);
    JSValue* ret = js_call_function(env, function, this, args);
    if (ret->type == TypeObject) {
        return ret;
    } else {
        return this;
    }
}

JSValue* js_object_constructor(JSEnv* env, JSValue* this, List argValues, Dict binding) {
    return js_new_object(env, NULL);
}

JSValue* js_array_constructor(JSEnv* env, JSValue* this, List argValues, Dict binding) {
    int i = 0;
    while (argValues != NULL) {
        set_object_property(this, js_to_string(env, js_new_number(i))->string_value, list_head(argValues));
        argValues = list_tail(argValues);
        i++;
    }
    set_object_property(this, "length", js_new_number(i));
    return this;
}

JSValue* js_number_constructor(JSEnv* env, JSValue* this, List argValues, Dict binding) {
    this->number_value = ((JSValue*) list_head(argValues))->number_value;
    return this;
}

JSValue* js_number_value_of(JSEnv* env, JSValue* this, List argValues, Dict binding) {
    return js_new_number(this->number_value);
}

JSValue* js_number_to_string(JSEnv* env, JSValue* this, List argValues, Dict binding) {
    return js_to_string(env, js_new_number(this->number_value));
}

JSValue* js_is_prototype_of(JSEnv* env, JSValue* this, List argValues, Dict binding) {
    JSValue* maybeChild = (JSValue*) list_head(argValues);

    while (maybeChild != NULL) {
        if (maybeChild->object_value->prototype == this) {
            return js_new_boolean(1);
        }
        maybeChild = maybeChild->object_value->prototype;
    }
    return js_new_boolean(0);
}

JSValue* js_console_log(JSEnv* env, JSValue* this, List argValues, Dict binding) {
    printf("%s\n", js_to_string(env, list_head(argValues))->string_value);
    return js_new_undefined();
}

Dict js_append_args_to_binding(List argNames, List argValues, Dict dict) {
    while (argNames != NULL) {
        if (argValues != NULL) {
            dict = dict_insert(dict, list_head(argNames), js_create_variable(list_head(argValues)));
            argValues = list_tail(argValues);
        } else {
            dict = dict_insert(dict, list_head(argNames), js_create_variable(js_new_undefined()));
        }
        argNames = list_tail(argNames);
    }
    return dict;
}

void js_create_native_objects(JSEnv* env) {
    JSValue* global = env->global;
    set_object_property(global, "global", global);

    JSValue* object_prototype = js_new_bare_object();
    set_object_property(object_prototype, "isPrototypeOf", js_new_bare_function(&js_is_prototype_of, NULL));

    JSValue* object_constructor = js_new_bare_function(&js_object_constructor, NULL);
    object_constructor->object_value = malloc(sizeof(JSObject));
    object_constructor->object_value->properties = dict_create();
    object_constructor->object_value->prototype = NULL;
    set_object_property(object_constructor, "prototype", object_prototype);
    set_object_property(global, "Object", object_constructor);

    JSValue* array_constructor = js_new_function(env, &js_array_constructor, NULL);
    set_object_property(global, "Array", array_constructor);

    JSValue* number_constructor = js_new_function(env, &js_number_constructor, NULL);
    JSValue* number_prototype = get_object_property(number_constructor, "prototype");
    set_object_property(global, "Number", number_constructor);
    set_object_property(number_prototype, "valueOf", js_new_function(env, &js_number_value_of, NULL));
    set_object_property(number_prototype, "toString", js_new_function(env, &js_number_to_string, NULL));

    JSValue* console = js_new_object(env, NULL);
    set_object_property(console, "log", js_new_function(env, &js_console_log, NULL));
    set_object_property(global, "console", console);
}
