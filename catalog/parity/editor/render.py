# Static render of the admin series workspace (edit mode) for UI tests: the admin
# pages need a GitHub login, so the page is rendered from its Thymeleaf template
# as an admin would see it. Usage: python3 render.py <grid> <out.html>
import os, re, sys
from bs4 import BeautifulSoup
T = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../index-boot/src/main/resources/templates/')
grid = sys.argv[1]
ctx = {'admin': True, 'authenticated': True, 'error': None, 'mode': 'edit'}
def truth(expr):
    e = expr.strip()[2:-1].strip()
    e = e.replace('!=', ' NE ').replace('!', ' not ').replace(' NE ', ' != ').replace("'", '"').replace('null', 'None')
    return bool(eval(e, {}, ctx))
vals = {'originalName': 'Test', 'prettyName': 'Test série', 'f_name': 'Test', 'f_grid': grid, 'f_sheets': '490v',
        'f_field': '490a', 'f_groupby': 'field.substring(0,4)', 'f_thumbnailUrl': '', 'f_descCs': '', 'f_descEn': '',
        'mode': 'edit'}
def frag(path, name):
    soup = BeautifulSoup(open(T + path).read(), 'html.parser')
    el = soup.find(attrs={'th:fragment': re.compile('^' + name)})
    return el
soup = BeautifulSoup(open(T + 'admin/series-workspace.html').read(), 'html.parser')
for el in list(soup.find_all(attrs={'th:replace': True})):
    r = el['th:replace']
    if 'leftPanel' in r: el.replace_with(frag('admin/fragments.html', 'leftPanel'))
    elif 'topPanel' in r: el.replace_with(frag('admin/fragments.html', 'topPanel'))
    else: el.decompose()
for el in list(soup.find_all(True)):
    if el.decomposed if hasattr(el, 'decomposed') else False: continue
    if el.attrs is None: continue
    if 'th:if' in el.attrs and not truth(el['th:if']): el.decompose(); continue
    if 'th:unless' in el.attrs and truth(el['th:unless']): el.decompose(); continue
for el in soup.find_all(True):
    for a in list(el.attrs):
        if not a.startswith('th:'): continue
        v = el[a]
        if a in ('th:src', 'th:href'):
            m = re.match(r'@\{([^}(]*)', v)
            el[a[3:]] = m.group(1) if m else '#'
        elif a == 'th:value':
            el['value'] = vals.get(v[2:-1], '')
        elif a == 'th:text':
            el.string = vals.get(v[2:-1], '') if v.startswith('${') else ''
        elif a == 'th:attr':
            for part in v.split(','):
                k, x = part.split('=', 1)
                el[k.strip()] = vals.get(x.strip()[2:-1], '')
        del el[a]
open(sys.argv[2], 'w').write(str(soup))
