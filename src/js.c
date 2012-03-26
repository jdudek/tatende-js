#include <stdlib.h>
#include <string.h>
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
    struct TJSValue* (*function)();
    Dict binding;
} JSClosure;

typedef struct TJSValue {
    enum JSType type;
    int number_value;
    char* string_value;
    char boolean_value;
    Dict object_value;
    JSClosure function_value;
    struct TJSValue* prototype;
} JSValue;

typedef JSValue** JSVariable;

JSValue* js_new_bare_function(JSValue* (*function_ptr)(), Dict binding);
void js_throw(JSValue* global, JSValue* exception);
JSValue* js_call_method(JSValue* global, JSValue* object, JSValue* key, List args);
JSValue* js_invoke_constructor(JSValue* global, JSValue* function, List args);
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
    v->object_value = NULL;
    v->prototype = NULL;
    return v;
}

JSValue* js_new_object(JSValue* global, Dict d) {
    JSValue* v = js_new_bare_object();
    v->object_value = d;
    v->prototype = get_object_property(get_object_property(global, "Object"), "prototype");
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

JSValue* js_new_function(JSValue* global, JSValue* (*function_ptr)(), Dict binding) {
    JSValue* v = js_new_bare_function(function_ptr, binding);

    // function is also an object, initialize properties dictionary
    v->object_value = dict_create();

    // every function has a prototype object for instances
    v->object_value = dict_insert(v->object_value, "prototype", js_new_object(global, dict_create()));

    return v;
}

JSValue* js_new_undefined() {
    JSValue* v = malloc(sizeof(JSValue));
    v->type = TypeUndefined;
    return v;
}

JSValue* js_to_string(JSValue* global, JSValue* v) {
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
            return js_call_method(global, v, js_new_string("toString"), list_create());
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

JSValue* js_to_object(JSValue* global, JSValue* v) {
    if (v->type == TypeObject || v->type == TypeFunction) {
        return v;
    } else if (v->type == TypeNumber) {
        return js_invoke_constructor(global, get_object_property(global, "Number"),
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

JSValue* js_call_function(JSValue* global, JSValue* v, JSValue* this, List args) {
    if (v->type == TypeFunction) {
        return (v->function_value.function)(global, this, args, v->function_value.binding);
    } else {
        JSValue* message = js_add(js_typeof(v), js_new_string(" is not a function."));
        JSValue* exception = js_invoke_constructor(global, get_object_property(global, "TypeError"),
            list_insert(list_create(), message));
        js_throw(global, exception);
    }
}

JSVariable js_create_variable(JSValue* value) {
    JSVariable var = malloc(sizeof(JSValue*));
    *var = value;
    return var;
}

void js_assign_variable(JSValue* global, Dict binding, char* name, JSValue* value) {
    JSVariable variable = dict_find(binding, name);
    if (variable != NULL) {
        *variable = value;
    } else {
        set_object_property(global, name, value);
    }
}

JSValue* js_get_variable_rvalue(JSValue* global, Dict binding, char* name) {
    JSVariable variable = dict_find(binding, name);
    if (variable != NULL) {
        return *variable;
    } else {
        JSValue* global_value = dict_find(global->object_value, name);
        if (global_value) {
            return global_value;
        } else {
            JSValue* message = js_add(js_new_string(name), js_new_string(" is not defined."));
            JSValue* exception = js_invoke_constructor(global, get_object_property(global, "ReferenceError"),
                list_insert(list_create(), message));
            js_throw(global, exception);
        }
    }
}

void js_throw(JSValue* global, JSValue* exception) {
    fprintf(stderr, "%s\n", js_to_string(global, exception)->string_value);
    exit(1);
}

static JSValue* get_object_property(JSValue* object, char* key) {
    while (object != NULL) {
        JSValue* value = (JSValue*) dict_find_with_default(
            object->object_value, key, js_new_undefined());
        if (value->type != TypeUndefined) {
            return value;
        } else {
            object = object->prototype;
        }
    }
    return js_new_undefined();
}

static void set_object_property(JSValue* object, char* key, JSValue* value) {
    object->object_value = dict_insert(object->object_value, key, value);
}

JSValue* js_get_object_property(JSValue* global, JSValue* object, JSValue* key) {
    return get_object_property(object, js_to_string(global, key)->string_value);
}

JSValue* js_call_method(JSValue* global, JSValue* object, JSValue* key, List args) {
    return js_call_function(global, js_get_object_property(global, object, key), object, args);
}

JSValue* js_invoke_constructor(JSValue* global, JSValue* function, List args) {
    JSValue* this = js_new_object(global, dict_create());
    this->prototype = dict_find(function->object_value, "prototype");
    JSValue* ret = js_call_function(global, function, this, args);
    if (ret->type == TypeObject) {
        return ret;
    } else {
        return this;
    }
}

JSValue* js_object_constructor(JSValue* global, JSValue* this, List argValues, Dict binding) {
    return js_new_object(global, NULL);
}

JSValue* js_number_constructor(JSValue* global, JSValue* this, List argValues, Dict binding) {
    this->number_value = ((JSValue*) list_head(argValues))->number_value;
    return this;
}

JSValue* js_number_value_of(JSValue* global, JSValue* this, List argValues, Dict binding) {
    return js_new_number(this->number_value);
}

JSValue* js_number_to_string(JSValue* global, JSValue* this, List argValues, Dict binding) {
    return js_to_string(global, js_new_number(this->number_value));
}

JSValue* js_is_prototype_of(JSValue* global, JSValue* this, List argValues, Dict binding) {
    JSValue* maybeChild = (JSValue*) list_head(argValues);

    while (maybeChild != NULL) {
        if (maybeChild->prototype == this) {
            return js_new_boolean(1);
        }
        maybeChild = maybeChild->prototype;
    }
    return js_new_boolean(0);
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

void js_create_native_objects(JSValue* global) {
    set_object_property(global, "global", global);

    JSValue* object_prototype = js_new_bare_object();
    set_object_property(object_prototype, "isPrototypeOf", js_new_bare_function(&js_is_prototype_of, NULL));

    JSValue* object_constructor = js_new_bare_function(&js_object_constructor, NULL);
    object_constructor->object_value = dict_create();
    set_object_property(object_constructor, "prototype", object_prototype);
    set_object_property(global, "Object", object_constructor);

    JSValue* number_constructor = js_new_function(global, &js_number_constructor, NULL);
    JSValue* number_prototype = get_object_property(number_constructor, "prototype");
    set_object_property(global, "Number", number_constructor);
    set_object_property(number_prototype, "valueOf", js_new_function(global, &js_number_value_of, NULL));
    set_object_property(number_prototype, "toString", js_new_function(global, &js_number_to_string, NULL));
}
