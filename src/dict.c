#include <stdio.h>
#include <stdlib.h>

typedef struct DictElem {
    char* key;
    void* value;
    struct DictElem* next;
} * Dict;

Dict dict_create() {
    return NULL;
}

int dict_is_empty(Dict dict) {
    return dict == NULL;
}

Dict dict_insert(Dict old_dict, char* key, void* value) {
    struct DictElem* new_dict = malloc(sizeof(struct DictElem));
    new_dict->key = key;
    new_dict->value = value;
    new_dict->next = old_dict;
    return new_dict;
}

void* dict_find(Dict dict, char* key) {
    if (dict == NULL) {
        return NULL;
    } else if (strcmp(dict->key, key) == 0) {
        return dict->value;
    } else {
        return dict_find(dict->next, key);
    }
}

void* dict_find_with_default(Dict dict, char* key, void* deflt) {
    void* r = dict_find(dict, key);
    if (r == NULL) {
        return deflt;
    } else {
        return r;
    }
}
