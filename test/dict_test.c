#include <stdio.h>
#include <stdlib.h>
#include <assert.h>

#include "../src/dict.c"

int main()
{
    Dict dict = dict_create();
    assert(dict_is_empty(dict));

    int *value = malloc(sizeof(int));
    *value = 42;
    dict = dict_insert(dict, "abc", value);
    assert(! dict_is_empty(dict));
    assert(*(int *)dict_find(dict, "abc") == 42);

    int *value2 = malloc(sizeof(int));
    *value2 = 37;
    dict = dict_insert(dict, "def", value2);
    assert(*(int *)dict_find(dict, "abc") == 42);
    assert(*(int *)dict_find(dict, "def") == 37);

    Dict dict2 = dict_insert(dict_insert(dict_create(), "abc", value), "def", value2);
    assert(*(int *)dict_find(dict2, "abc") == 42);
    assert(*(int *)dict_find(dict2, "def") == 37);

    return 0;
}
