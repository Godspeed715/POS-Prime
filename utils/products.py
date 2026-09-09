def remove_custom_placeholders(products: list[dict]) -> list[dict]:
    for product in products:
        if product['custom_name']!=None:
            product['name'] = product['custom_name']
        if product['custom_category']!=None:
            product['category'] = product['custom_category']

        del product['custom_name']
        del product['custom_category']
    return products

def remove_custom_placeholder(product: dict) -> dict:
    if product['custom_name']!=None:
        product['name'] = product['custom_name']
    if product['custom_category']!=None:
        product['category'] = product['custom_category']

    del product['custom_name']
    del product['custom_category']
    return product