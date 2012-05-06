#include <stdio.h>
#include <stdlib.h>

typedef struct ListElem {
    JSValue value;
    struct ListElem* next;
} * List;

List list_create() {
    return NULL;
}

int list_is_empty(List list) {
    return list == NULL;
}

List list_insert(List old_list, JSValue value) {
    struct ListElem* new_list = malloc(sizeof(struct ListElem));
    new_list->value = value;
    new_list->next = old_list;
    return new_list;
}

JSValue list_head(List list) {
    return list->value;
}

List list_tail(List list) {
    if (list == NULL) {
        return NULL;
    } else {
        return list->next;
    }
}
