#include <stdio.h>
#include <stdlib.h>
#include <assert.h>

#include "../src/list.c"

int main()
{
    List list = list_create();
    assert(list_is_empty(list));

    int *value = malloc(sizeof(int));
    *value = 42;
    list = list_insert(list, value);
    assert(! list_is_empty(list));
    assert(*(int *)list_head(list) == 42);
    assert(list_tail(list) == NULL);

    return 0;
}
