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
} JSValue;

typedef JSValue** JSVariable;

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

JSValue* js_new_object(Dict d) {
    JSValue* v = malloc(sizeof(JSValue));
    v->type = TypeObject;
    v->object_value = d;
    return v;
}

JSValue* js_new_function(JSValue* (*function_ptr)(), Dict binding) {
    JSValue* v = malloc(sizeof(JSValue));
    v->type = TypeFunction;
    JSClosure closure;
    closure.function = function_ptr;
    closure.binding = binding;
    v->function_value = closure;
    return v;
}

JSValue* js_new_undefined() {
    JSValue* v = malloc(sizeof(JSValue));
    v->type = TypeUndefined;
    return v;
}

JSValue* js_to_string(JSValue* v) {
    if (v->type == TypeString) {
        return v;
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

JSValue* js_call_function(JSValue* v, List args) {
    if (v->type == TypeFunction) {
        return (v->function_value.function)(args, v->function_value.binding);
    } else {
        fprintf(stderr, "Cannot call, value is not a function");
        exit(1);
    }
}

JSVariable js_create_variable(JSValue* value) {
    JSVariable var = malloc(sizeof(JSValue*));
    *var = value;
    return var;
}

static
JSVariable find_variable(Dict binding, char* name) {
    JSVariable variable = dict_find(binding, name);
    if (variable != NULL) {
        return variable;
    } else {
        fprintf(stderr, "ReferenceError: %s is not defined.\n", name);
        exit(0);
    }
}

void js_assign_variable(Dict binding, char* name, JSValue* value) {
    JSVariable variable = find_variable(binding, name);
    *variable = value;
}

JSVariable js_get_variable_lvalue(Dict binding, char* name) {
    return find_variable(binding, name);
}

JSValue* js_get_variable_rvalue(Dict binding, char* name) {
    JSVariable variable = find_variable(binding, name);
    return *variable;
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
