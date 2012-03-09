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
    Dict object_value;
    JSClosure function_value;
} JSValue;

void js_dump_value(JSValue* v)
{
    switch (v->type) {
        case TypeNumber:
            printf("%d", v->number_value);
            break;
        case TypeString:
            printf("%s", v->string_value);
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

JSValue* js_mult(JSValue* v1, JSValue* v2) {
    return js_new_number(v1->number_value * v2->number_value);
}

JSValue* js_to_string(JSValue* v) {
    if (v->type == TypeString) {
        return v;
    } else {
        fprintf(stderr, "Cannot convert to string");
        exit(1);
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

Dict js_append_args_to_binding(List argNames, List argValues, Dict dict) {
    while (argNames != NULL) {
        if (argValues != NULL) {
            dict = dict_insert(dict, list_head(argNames), list_head(argValues));
            argValues = list_tail(argValues);
        } else {
            dict = dict_insert(dict, list_head(argNames), js_new_undefined());
        }
        argNames = list_tail(argNames);
    }
    return dict;
}
