const $ = id => document.getElementById(id);

let token = localStorage.getItem('ya_token');
let products = [];
let categories = [];

async function api(url, opt = {}) {
  const response = await fetch(url, {
    ...opt,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opt.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Ошибка');
  }

  return data;
}

function showPanel() {
  $('login').hidden = true;
  $('panel').hidden = false;
}

function showLogin() {
  $('panel').hidden = true;
  $('login').hidden = false;
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function loadCategories() {
  categories = await api('/api/categories');

  $('category').innerHTML =
    '<option value="">Без категории</option>' +
    categories
      .filter(category => category.is_active)
      .map(category => `
        <option value="${category.id}">
          ${esc(category.name)}
        </option>
      `)
      .join('');

  renderCategories();
}

function renderCategories() {
  $('categoryList').innerHTML = categories.length
    ? categories.map(category => `
        <article class="item">
          <div></div>

          <div>
            <h3>${esc(category.name)}</h3>

            <div class="muted">
              ${category.is_active ? 'Показывается' : 'Скрыта'}
            </div>
          </div>

          <div class="itemBtns">
            <button onclick="editCategory(${category.id})">
              Изменить
            </button>

            <button
              class="gray"
              onclick="toggleCategory(${category.id})"
            >
              ${category.is_active ? 'Скрыть' : 'Показать'}
            </button>

            <button
              class="gray"
              onclick="deleteCategory(${category.id})"
            >
              Удалить
            </button>
          </div>
        </article>
      `).join('')
    : '<p class="muted">Категорий пока нет</p>';
}

async function load() {
  await loadCategories();

  products = await api('/api/products?all=1');

  render();
}

function render() {
  $('list').innerHTML = products.length
    ? products.map(product => `
        <article class="item">

          ${
            product.images?.[0]
              ? `<img src="${product.images[0].url}" alt="">`
              : '<div></div>'
          }

          <div>
            <h3>${esc(product.name)}</h3>

            <div>
              ${Number(product.price).toLocaleString('ru-RU')} ₽
            </div>

            <div class="muted">
              ${esc(product.category_name || 'Без категории')}
              · остаток ${product.stock}
            </div>

            <div class="muted">
              ${product.is_active ? 'Показывается' : 'Скрыт'}
            </div>
          </div>

          <div class="itemBtns">
            <button onclick="editP(${product.id})">
              Изменить
            </button>

            <button
              class="gray"
              onclick="delP(${product.id})"
            >
              Удалить
            </button>
          </div>

        </article>
      `).join('')
    : '<p class="muted">Товаров пока нет</p>';
}

function resetProductForm() {
  $('productForm').reset();
  $('pid').value = '';
  $('active').checked = true;
  $('formTitle').textContent = 'Добавить товар';
  $('cancel').hidden = true;
}

function resetCategoryForm() {
  $('categoryForm').reset();
  $('categoryId').value = '';
  $('categoryActive').checked = true;
  $('categorySubmit').textContent = 'Добавить категорию';
  $('categoryCancel').hidden = true;
}

window.editCategory = id => {
  const category = categories.find(item => item.id === id);

  if (!category) return;

  $('categoryId').value = category.id;
  $('categoryName').value = category.name;
  $('categoryActive').checked = Boolean(category.is_active);
  $('categorySubmit').textContent = 'Сохранить изменения';
  $('categoryCancel').hidden = false;
  $('categoryMsg').textContent = '';

  $('categoryName').focus();

  scrollTo({
    top: 0,
    behavior: 'smooth'
  });
};

window.toggleCategory = async id => {
  try {
    await api(`/api/categories/${id}/visibility`, {
      method: 'PATCH'
    });

    await loadCategories();
  } catch (error) {
    alert(error.message);
  }
};

window.deleteCategory = async id => {
  const category = categories.find(item => item.id === id);

  if (!category) return;

  const confirmed = confirm(
    `Удалить категорию «${category.name}»?\n\n` +
    'Товары из неё перейдут в «Без категории».'
  );

  if (!confirmed) return;

  try {
    await api(`/api/categories/${id}`, {
      method: 'DELETE'
    });

    resetCategoryForm();
    await load();
  } catch (error) {
    alert(error.message);
  }
};

window.editP = id => {
  const product = products.find(item => item.id === id);

  if (!product) return;

  $('pid').value = product.id;
  $('name').value = product.name;
  $('category').value = product.category_id || '';
  $('price').value = product.price;
  $('oldPrice').value = product.old_price || '';
  $('stock').value = product.stock;
  $('badge').value = product.badge || '';
  $('description').value = product.description || '';
  $('featured').checked = Boolean(product.is_featured);
  $('active').checked = Boolean(product.is_active);

  $('formTitle').textContent =
    `Редактирование: ${product.name}`;

  $('cancel').hidden = false;

  scrollTo({
    top: 0,
    behavior: 'smooth'
  });
};

window.delP = async id => {
  if (!confirm('Удалить товар?')) return;

  try {
    await api(`/api/products/${id}`, {
      method: 'DELETE'
    });

    await load();
  } catch (error) {
    alert(error.message);
  }
};

$('loginForm').onsubmit = async event => {
  event.preventDefault();

  $('loginMsg').textContent = '';

  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: $('email').value,
        password: $('password').value
      })
    });

    token = data.token;
    localStorage.setItem('ya_token', token);

    showPanel();
    await load();
  } catch (error) {
    $('loginMsg').textContent = error.message;
  }
};

$('categoryForm').onsubmit = async event => {
  event.preventDefault();

  const id = $('categoryId').value;
  const name = $('categoryName').value.trim();

  $('categoryMsg').textContent = '';

  try {
    await api(
      id ? `/api/categories/${id}` : '/api/categories',
      {
        method: id ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          is_active: $('categoryActive').checked
        })
      }
    );

    resetCategoryForm();

    $('categoryMsg').textContent = id
      ? 'Категория обновлена'
      : 'Категория добавлена';

    await load();
  } catch (error) {
    $('categoryMsg').textContent = error.message;
  }
};

$('productForm').onsubmit = async event => {
  event.preventDefault();

  const id = $('pid').value;
  const formData = new FormData();

  const fields = [
    ['name', $('name').value],
    ['category_id', $('category').value],
    ['price', $('price').value],
    ['old_price', $('oldPrice').value],
    ['stock', $('stock').value],
    ['badge', $('badge').value],
    ['description', $('description').value],
    ['is_featured', $('featured').checked],
    ['is_active', $('active').checked]
  ];

  for (const [key, value] of fields) {
    formData.set(key, value);
  }

  for (const file of $('images').files) {
    formData.append('images', file);
  }

  try {
    await api(
      id ? `/api/products/${id}` : '/api/products',
      {
        method: id ? 'PUT' : 'POST',
        body: formData
      }
    );

    $('formMsg').textContent = 'Сохранено';

    resetProductForm();
    await load();
  } catch (error) {
    $('formMsg').textContent = error.message;
  }
};

$('cancel').onclick = resetProductForm;

$('categoryCancel').onclick = resetCategoryForm;

$('refresh').onclick = load;

$('refreshCategories').onclick = loadCategories;

$('logout').onclick = () => {
  localStorage.removeItem('ya_token');
  token = null;
  showLogin();
};

(async () => {
  if (!token) {
    showLogin();
    return;
  }

  try {
    await api('/api/auth/me');
    showPanel();
    await load();
  } catch {
    localStorage.removeItem('ya_token');
    token = null;
    showLogin();
  }
})();
