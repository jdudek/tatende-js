#include <stdlib.h>
#include <string.h>

enum JSType {
    TypeUndefined,
    TypeNumber,
    TypeString,
    TypeBoolean,
    TypeFunction,
    TypeObject
};

typedef struct {
    enum JSType type;
    int number_value;
    char* string_value;
} JSValue;

void js_dump_value(JSValue v)
{
    switch (v.type) {
        case TypeNumber:
            printf("%d", v.number_value);
            break;
        case TypeString:
            printf("%s", v.string_value);
            break;
        default:
            printf("cannot dump value");
            break;
    }
}

JSValue js_new_number(int n) {
    JSValue v;
    v.type = TypeNumber;
    v.number_value = n;
    return v;
}

JSValue js_new_string(char* s) {
    JSValue v;
    v.type = TypeString;
    v.string_value = s;
    return v;
}

JSValue js_add(JSValue v1, JSValue v2) {
    if (v1.type == TypeNumber && v2.type == TypeNumber) {
        return js_new_number(v1.number_value + v2.number_value);
    } else if (v1.type == TypeString && v2.type == TypeString) {
        char* new_string = malloc(sizeof(char) * (strlen(v1.string_value) + strlen(v2.string_value) + 1));
        strcpy(new_string, v1.string_value);
        strcat(new_string, v2.string_value);
        return js_new_string(new_string);
    } else {
        fprintf(stderr, "Cannot add");
        exit(0);
    }
}

JSValue js_mult(JSValue v1, JSValue v2) {
    return js_new_number(v1.number_value * v2.number_value);
}
