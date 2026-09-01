def remove_custom_placeholders(products: dict) -> dict:
    for product in products:
        if product['custom_name']!=None:
            product['name'] = product['custom_name']
        if product['custom_category']!=None:
            product['category'] = product['custom_category']

        del product['custom_name']
        del product['custom_category']
    return products