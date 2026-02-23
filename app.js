// ========================
// SERVICE WORKER
// ========================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then(() => console.log('✅ SW OK'))
    .catch(err => console.error('❌ SW Error', err));
}

// ========================
// DATABASE
// ========================
let db;
let periodoAttuale = 'trim1';

const dbRequest = indexedDB.open('SchoolCompanionDB', 2);

dbRequest.onerror = () => {
  showNotification('Errore nel caricamento del database', 'error');
};

dbRequest.onsuccess = () => {
  db = dbRequest.result;
  console.log('✅ DB OK');
  caricaImpostazioni();
  mostraMaterie();
  aggiornaSelectMaterie();
  updateDateTime();
  setInterval(updateDateTime, 60000);
};

dbRequest.onupgradeneeded = (event) => {
  db = event.target.result;
  
  if (!db.objectStoreNames.contains('materie')) {
    const store = db.createObjectStore('materie', { keyPath: 'id', autoIncrement: true });
    store.createIndex('nome', 'nome', { unique: false });
  }

  if (!db.objectStoreNames.contains('todo')) {
    const todoStore = db.createObjectStore('todo', { keyPath: 'id', autoIncrement: true });
    todoStore.createIndex('data', 'data', { unique: false });
  }

  if (!db.objectStoreNames.contains('verifiche')) {
    const verificheStore = db.createObjectStore('verifiche', { keyPath: 'id', autoIncrement: true });
    verificheStore.createIndex('data', 'data', { unique: false });
    verificheStore.createIndex('materiaId', 'materiaId', { unique: false });
  }

  if (!db.objectStoreNames.contains('pagelle')) {
    db.createObjectStore('pagelle', { keyPath: 'id', autoIncrement: true });
  }

  if (!db.objectStoreNames.contains('settings')) {
    db.createObjectStore('settings', { keyPath: 'key' });
  }
};

// ========================
// UTILITY
// ========================

function showNotification(message, type = 'success') {
  const container = document.getElementById('notification-container');
  const notif = document.createElement('div');
  notif.className = `notification notification-${type}`;
  notif.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i><span>${message}</span>`;
  container.appendChild(notif);
  setTimeout(() => notif.remove(), 4000);
}

function getOggi() {
  return new Date().toISOString().slice(0, 10);
}

function formatData(dataStr) {
  const date = new Date(dataStr);
  return date.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
}

function getVotiMateria(materia) {
  if (!Array.isArray(materia.voti)) materia.voti = [];
  if (materia.voti.length === 0) return [];
  if (typeof materia.voti[0] === 'object' && materia.voti[0].valore !== undefined) return materia.voti;
  
  materia.voti = materia.voti.map(v => ({ valore: Number(v), data: getOggi(), periodo: 'trim1' }));
  const tx = db.transaction(['materie'], 'readwrite');
  tx.objectStore('materie').put(materia);
  return materia.voti;
}

function updateDateTime() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
  const formatted = now.toLocaleDateString('it-IT', options);
  const el = document.getElementById('dateTime');
  if (el) el.textContent = formatted;
}

function getNomiGiorni() {
  return ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
}

function getSettimanaData(data) {
  const d = new Date(data);
  const giorno = d.getDay();
  const differenza = d.getDate() - (giorno === 0 ? 6 : giorno - 1);
  const lunedi = new Date(d.setDate(differenza));
  
  const giorni = [];
  for (let i = 0; i < 7; i++) {
    const g = new Date(lunedi);
    g.setDate(g.getDate() + i);
    giorni.push(g.toISOString().slice(0, 10));
  }
  return giorni;
}

function getBoundariesPerioodo(periodo) {
  const anno = new Date().getFullYear();
  
  switch(periodo) {
    case 'trim1':
      return {
        inizio: `${anno}-09-01`,
        fine: `${anno}-12-31`,
        nome: '1° Trimestre (Sett-Dic)'
      };
    case 'pent':
      return {
        inizio: `${anno}-01-01`,
        fine: `${anno}-06-30`,
        nome: 'Pentamestre (Gen-Giu)'
      };
    default:
      return {
        inizio: '2000-01-01',
        fine: '2099-12-31',
        nome: 'Tutte le statistiche'
      };
  }
}

function filtraVotiPerPerioodo(voti, periodo) {
  const bounds = getBoundariesPerioodo(periodo);
  return voti.filter(v => (v.periodo === periodo || !v.periodo) && v.data >= bounds.inizio && v.data <= bounds.fine);
}

function calcolaMediaMateria(voti) {
  if (!voti || voti.length === 0) return null;
  const somma = voti.reduce((acc, v) => acc + v.valore, 0);
  return (somma / voti.length).toFixed(2);
}

// ========================
// MATERIE (Solo impostazioni)
// ========================

function mostraMaterie() {
  const lista = document.getElementById('settingsListaMaterie');
  if (!lista) return;
  lista.innerHTML = '';

  const tx = db.transaction(['materie'], 'readonly');
  const store = tx.objectStore('materie');
  const request = store.getAll();

  request.onsuccess = () => {
    const materie = request.result;
    if (materie.length === 0) {
      lista.innerHTML = '<li style="text-align: center; padding: 20px; color: var(--text-light); border: none;"><i class="fas fa-book-open"></i> Nessuna materia</li>';
      return;
    }

    materie.forEach((materia) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
          <i class="fas fa-book" style="color: var(--primary);"></i>
          <span>${materia.nome}</span>
        </div>
        <button class="btn-delete" onclick="eliminaMateria(${materia.id})">
          <i class="fas fa-trash"></i>
        </button>
      `;
      lista.appendChild(li);
    });
  };
}

function aggiungiMateria(nome) {
  nome = nome.trim();
  if (!nome || !db) {
    showNotification('Inserisci un nome valido', 'error');
    return;
  }

  const tx = db.transaction(['materie'], 'readwrite');
  const store = tx.objectStore('materie');
  store.add({ nome, voti: [] });

  tx.oncomplete = () => {
    mostraMaterie();
    aggiornaSelectMaterie();
    document.getElementById('settingsNomeMateria').value = '';
    showNotification(`✅ Materia "${nome}" aggiunta!`, 'success');
  };

  tx.onerror = () => showNotification('Errore', 'error');
}

function eliminaMateria(id) {
  if (!confirm('Elimina materia e voti?')) return;

  const tx = db.transaction(['materie'], 'readwrite');
  tx.objectStore('materie').delete(id);

  tx.oncomplete = () => {
    mostraMaterie();
    aggiornaSelectMaterie();
    showNotification('✅ Eliminato', 'success');
  };
}

function aggiornaSelectMaterie() {
  const select = document.getElementById('materiaSelect');
  const selectVerifiche = document.getElementById('verificaMateriaSelect');
  if (!select) return;
  
  select.innerHTML = "<option value=''>Seleziona materia</option>";
  if (selectVerifiche) selectVerifiche.innerHTML = "<option value=''>Seleziona materia</option>";

  const tx = db.transaction(['materie'], 'readonly');
  const store = tx.objectStore('materie');
  const request = store.getAll();

  request.onsuccess = () => {
    request.result.forEach((materia) => {
      const option = document.createElement('option');
      option.value = materia.id;
      option.textContent = materia.nome;
      select.appendChild(option);
      if (selectVerifiche) selectVerifiche.appendChild(option.cloneNode(true));
    });
  };
}

// ========================
// VOTI
// ========================

function updateVotoDisplay(value) {
  const display = document.getElementById('votoDisplay');
  if (display) {
    const span = display.querySelector('span');
    if (span) span.textContent = value;
  }
}

function aggiungiVoto(materiaId, valore) {
  const data = getOggi();
  const periodo = document.getElementById('votoPeriodo')?.value || 'trim1';
  materiaId = Number(materiaId);
  valore = Number(valore);

  if (!materiaId || isNaN(valore) || valore < 0 || valore > 10) {
    showNotification('Seleziona materia e voto valido', 'error');
    return;
  }

  const tx = db.transaction(['materie'], 'readwrite');
  const store = tx.objectStore('materie');
  const request = store.get(materiaId);

  request.onsuccess = () => {
    const materia = request.result;
    if (!materia) {
      showNotification('Materia non trovata', 'error');
      return;
    }

    materia.voti = getVotiMateria(materia);
    materia.voti.push({ valore, data, periodo });
    store.put(materia);

    tx.oncomplete = () => {
      mostraVoti();
      document.getElementById('votoSlider').value = 0;
      updateVotoDisplay(0);
      showNotification(`✅ Voto ${valore} registrato (${periodo === 'trim1' ? '1° Trim' : 'Pentam'})!`, 'success');
    };
  };
}

function mostraVoti() {
  const materiaId = Number(document.getElementById('materiaSelect').value);
  const lista = document.getElementById('listaVoti');
  if (!lista) return;

  if (!materiaId) {
    lista.innerHTML = '';
    return;
  }

  const tx = db.transaction(['materie'], 'readonly');
  const store = tx.objectStore('materie');
  const request = store.get(materiaId);

  request.onsuccess = () => {
    const materia = request.result;
    const voti = getVotiMateria(materia);
    lista.innerHTML = '';

    if (voti.length === 0) {
      lista.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-light);"><i class="fas fa-inbox"></i><p>Nessun voto</p></div>';
      return;
    }

    voti.sort((a, b) => new Date(b.data) - new Date(a.data));

    voti.forEach((voto, idx) => {
      const li = document.createElement('li');
      let classe = 'voto-medio';
      let emoji = '📊';
      if (voto.valore < 5) {
        classe = 'voto-basso';
        emoji = '😟';
      } else if (voto.valore > 7) {
        classe = 'voto-alto';
        emoji = '🎉';
      }

      const periodo = voto.periodo === 'trim1' ? '1° Trim' : 'Pentam';

      li.className = classe;
      li.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
          <div style="display: flex; align-items: center; justify-content: center; width: 50px; height: 50px; border-radius: 10px; background: var(--primary); color: white; font-weight: bold; font-size: 1.3rem; box-shadow: 0 4px 12px rgba(0, 120, 212, 0.3);">
            ${voto.valore}
          </div>
          <div>
            <div style="font-weight: 600; font-size: 1rem;">${emoji} ${voto.valore}/10</div>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">${formatData(voto.data)} • ${periodo}</div>
          </div>
        </div>
        <button class="btn-delete" onclick="eliminaVoto(${materiaId}, ${idx})">
          <i class="fas fa-trash"></i>
        </button>
      `;
      lista.appendChild(li);
    });
  };
}

function eliminaVoto(materiaId, idx) {
  const tx = db.transaction(['materie'], 'readwrite');
  const store = tx.objectStore('materie');
  const request = store.get(materiaId);

  request.onsuccess = () => {
    const materia = request.result;
    materia.voti = getVotiMateria(materia);
    materia.voti.splice(idx, 1);
    store.put(materia);

    tx.oncomplete = () => {
      mostraVoti();
      showNotification('✅ Voto eliminato', 'success');
    };
  };
}

// ========================
// STATISTICHE
// ========================

function calcolaTarget(materiaId, mediaAttuale, nVoti) {
  const input = document.getElementById(`target-${materiaId}`);
  const target = Number(input.value);
  if (!target || target < 0 || target > 10) {
    showNotification('Target valido (0-10)', 'error');
    return;
  }

  const x = target * (nVoti + 1) - mediaAttuale * nVoti;
  const span = document.getElementById(`risultato-target-${materiaId}`);

  if (x > 10) {
    span.innerHTML = `<span style="color: #f44336;">❌ Impossibile (serve > 10)</span>`;
  } else if (x < 0) {
    span.innerHTML = `<span style="color: #4caf50;">✅ Già raggiunto!</span>`;
  } else {
    span.innerHTML = `<span style="color: #ff9800;">📊 Voto minimo: ${x.toFixed(2)}</span>`;
  }
}

function mostraStatPerioodo(periodo) {
  periodoAttuale = periodo;
  
  document.querySelectorAll('.btn-period').forEach(btn => btn.classList.remove('active'));
  event.target.closest('.btn-period').classList.add('active');
  
  mostraStatistiche();
}

function mostraStatistiche() {
  const container = document.getElementById('statisticheContent');
  if (!container) return;
  
  const bounds = getBoundariesPerioodo(periodoAttuale);
  
  container.innerHTML = '<div style="text-align: center; padding: 40px 20px;"><i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary);"></i><p>Caricando...</p></div>';

  const tx = db.transaction(['materie'], 'readonly');
  const store = tx.objectStore('materie');
  const request = store.getAll();

  request.onsuccess = () => {
    const materie = request.result;

    if (materie.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding: 40px 20px;"><p style="color: var(--text-light);"><i class="fas fa-inbox"></i> Aggiungi materie nelle impostazioni</p></div>';
      return;
    }

    const tuttiVoti = [];
    const materieFiltered = materie.map(m => {
      const voti = getVotiMateria(m);
      const votiPerioodo = filtraVotiPerPerioodo(voti, periodoAttuale);
      tuttiVoti.push(...votiPerioodo.map(v => v.valore));
      return { ...m, votiPerioodo };
    });

    const nVotiTotali = tuttiVoti.length;
    const mediaGlobale = nVotiTotali > 0 ? (tuttiVoti.reduce((a, b) => a + b, 0) / nVotiTotali).toFixed(2) : 'N/D';
    const votoMigliore = nVotiTotali > 0 ? Math.max(...tuttiVoti) : 'N/D';
    const votoPeggiore = nVotiTotali > 0 ? Math.min(...tuttiVoti) : 'N/D';

    let materiaMigliore = null, materiaPeggiore = null;
    let maxMedia = -Infinity, minMedia = Infinity;

    const statsMaterie = materieFiltered
      .map(m => {
        const media = calcolaMediaMateria(m.votiPerioodo);
        const nVoti = m.votiPerioodo.length;
        if (media !== null) {
          if (media > maxMedia) { maxMedia = media; materiaMigliore = m.nome; }
          if (media < minMedia) { minMedia = media; materiaPeggiore = m.nome; }
        }
        return { nome: m.nome, id: m.id, nVoti, media, voti: m.votiPerioodo };
      })
      .filter(s => s.nVoti > 0)
      .map(s => `<li class="stat-materia">
        <div style="display: flex; align-items: center; gap: 8px;"><i class="fas fa-bookmark" style="color: var(--primary);"></i> ${s.nome}</div>
        <div>
          <span>📊 Voti: ${s.nVoti}</span>
          <span>📈 Media: ${s.media || 'N/D'}</span>
        </div>
        ${s.nVoti > 0 ? `
          <div style="margin-top: 12px; display: flex; gap: 8px;">
            <input type="number" min="0" max="10" step="0.1" id="target-${s.id}" placeholder="Target" class="form-input" style="flex:1; padding: 8px 10px;">
            <button onclick="calcolaTarget(${s.id}, ${s.media || 0}, ${s.nVoti})" style="background-color: var(--primary); color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; white-space: nowrap; font-weight: 600;">Calcola</button>
          </div>
          <span id="risultato-target-${s.id}" style="display: block; margin-top: 8px; font-size: 0.9rem;"></span>
        ` : ''}
      </li>`)
      .join('');

    const html = `
      <div class="stat">
        <h3><i class="fas fa-chart-pie"></i> ${bounds.nome}</h3>
        <div class="stat-grid">
          <div class="stat-box">
            <span class="stat-label">📚 Materie</span>
            <span class="stat-value">${materie.length}</span>
          </div>
          <div class="stat-box">
            <span class="stat-label">✏️ Voti</span>
            <span class="stat-value">${nVotiTotali}</span>
          </div>
          <div class="stat-box">
            <span class="stat-label">📊 Media</span>
            <span class="stat-value">${mediaGlobale}</span>
          </div>
          <div class="stat-box" style="background: linear-gradient(135deg, #4caf50, #388e3c);">
            <span class="stat-label">🎉 Miglior Voto</span>
            <span class="stat-value">${votoMigliore}</span>
          </div>
          <div class="stat-box" style="background: linear-gradient(135deg, #f44336, #c62828);">
            <span class="stat-label">📉 Peggior Voto</span>
            <span class="stat-value">${votoPeggiore}</span>
          </div>
        </div>
        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
          ${materiaMigliore && nVotiTotali > 0 ? `<p style="margin-bottom: 8px;"><strong>🏆 Materia migliore:</strong> ${materiaMigliore} (${maxMedia})</p>` : ''}
          ${materiaPeggiore && minMedia < 6 && nVotiTotali > 0 ? `<p><strong>⚠️ Materia da migliorare:</strong> ${materiaPeggiore} (${minMedia.toFixed(2)})</p>` : ''}
          ${nVotiTotali === 0 ? `<p style="color: var(--text-light); font-style: italic;"><i class="fas fa-inbox"></i> Nessun voto in questo periodo</p>` : ''}
        </div>
      </div>
      ${statsMaterie.length > 0 ? `
        <div class="stat">
          <h3><i class="fas fa-graduation-cap"></i> Per Materia + Target</h3>
          <ul class="stat-materia-list">
            ${statsMaterie}
          </ul>
        </div>
      ` : ''}
    `;

    container.innerHTML = html;
  };
}

// ========================
// PAGELLE
// ========================

function cambiaTabPagelle(tab) {
  document.querySelectorAll('.pagelle-view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.btn-verifica-tab').forEach(b => b.classList.remove('active'));
  
  const btnIndex = tab === 'inserisci' ? 0 : tab === 'storico' ? 1 : 2;
  document.querySelectorAll('.btn-verifica-tab')[btnIndex].classList.add('active');
  
  if (tab === 'inserisci') {
    document.getElementById('pagelleInserisciView').classList.add('active');
    caricaInputMaterie();
  } else if (tab === 'storico') {
    document.getElementById('pagelleStorico View').classList.add('active');
    mostraPagelle();
  } else {
    document.getElementById('pagellePredizoneView').classList.add('active');
  }
}

function caricaInputMaterie() {
  const container = document.getElementById('pagellaInputMaterie');
  container.innerHTML = '';

  const tx = db.transaction(['materie'], 'readonly');
  const store = tx.objectStore('materie');
  const request = store.getAll();

  request.onsuccess = () => {
    request.result.forEach(materia => {
      const div = document.createElement('div');
      div.style.display = 'flex';
      div.style.gap = '10px';
      div.style.marginBottom = '12px';
      div.innerHTML = `
        <input type="number" id="pagella-${materia.id}" min="0" max="10" step="0.5" placeholder="Voto" class="form-input" style="flex: 1;">
        <span style="flex: 0.5; display: flex; align-items: center; font-weight: 600; color: var(--text-secondary);"><i class="fas fa-check-circle"></i> ${materia.nome}</span>
      `;
      container.appendChild(div);
    });
  };
}

function salvaPagella() {
  const periodo = document.getElementById('pagellaPerioodo').value;
  const data = document.getElementById('pagellaData').value;

  if (!periodo || !data) {
    showNotification('Seleziona periodo e data', 'error');
    return;
  }

  const tx = db.transaction(['materie'], 'readonly');
  const store = tx.objectStore('materie');
  const request = store.getAll();

  request.onsuccess = () => {
    const pagellaMaterie = [];
    let almenoUnVoto = false;

    request.result.forEach(materia => {
      const input = document.getElementById(`pagella-${materia.id}`);
      const voto = input.value.trim();
      
      if (voto) {
        pagellaMaterie.push({
          id: materia.id,
          nome: materia.nome,
          voto: Number(voto)
        });
        almenoUnVoto = true;
      }
    });

    if (!almenoUnVoto) {
      showNotification('Inserisci almeno un voto', 'error');
      return;
    }

    const mediaPagella = (pagellaMaterie.reduce((a, b) => a + b.voto, 0) / pagellaMaterie.length).toFixed(2);

    const pagellaData = {
      id: `pagella-${Date.now()}`,
      periodo: periodo,
      data: data,
      materie: pagellaMaterie,
      media: mediaPagella,
      tipo: 'reale'
    };

    const txPagelle = db.transaction(['pagelle'], 'readwrite');
    txPagelle.objectStore('pagelle').add(pagellaData);

    txPagelle.oncomplete = () => {
      document.getElementById('pagellaData').value = '';
      caricaInputMaterie();
      mostraPagelle();
      showNotification('✅ Pagella salvata!', 'success');
    };
  };
}

function mostraPagelle() {
  const container = document.getElementById('pagelleContent');
  if (!container) return;

  const tx = db.transaction(['pagelle'], 'readonly');
  const store = tx.objectStore('pagelle');
  const request = store.getAll();

  request.onsuccess = () => {
    const pagelle = request.result
      .filter(p => p.tipo === 'reale')
      .sort((a, b) => new Date(b.data) - new Date(a.data));

    if (pagelle.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding: 40px 20px; color: var(--text-light);"><i class="fas fa-inbox"></i><p>Nessuna pagella salvata</p></div>';
      return;
    }

    container.innerHTML = pagelle.map(pagella => {
      const bounds = getBoundariesPerioodo(pagella.periodo);
      
      const pagellaMatriceHtml = pagella.materie.map(m => `
        <div class="pagella-materia-row">
          <span>${m.nome}</span>
          <span style="font-weight: 600; color: var(--primary);">${m.voto}</span>
        </div>
      `).join('');

      return `
        <div class="pagella-card">
          <div class="pagella-header">
            ${bounds.nome}
            <span style="font-size: 0.85rem; opacity: 0.9;">${formatData(pagella.data)}</span>
          </div>
          <div class="pagella-body">
            <div class="pagella-stats">
              <div class="pagella-stat-box">
                <div class="pagella-stat-label">📊 Media Pagella</div>
                <div class="pagella-stat-value">${pagella.media}</div>
              </div>
              <div class="pagella-stat-box">
                <div class="pagella-stat-label">📚 Materie</div>
                <div class="pagella-stat-value">${pagella.materie.length}</div>
              </div>
            </div>

            <div class="pagella-materie">
              <h4><i class="fas fa-list-check"></i> Voti per Materia</h4>
              <div class="pagella-materie-list">${pagellaMatriceHtml}</div>
            </div>

            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border);">
              <button class="btn-delete" onclick="eliminaPagella('${pagella.id}')" style="width: 100%;">
                <i class="fas fa-trash"></i> Elimina Pagella
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  };
}

function eliminaPagella(id) {
  if (!confirm('Elimina questa pagella?')) return;

  const tx = db.transaction(['pagelle'], 'readwrite');
  const store = tx.objectStore('pagelle');
  const request = store.getAll();

  request.onsuccess = () => {
    const pagella = request.result.find(p => p.id === id);
    if (pagella) {
      const pagIndex = request.result.indexOf(pagella);
      store.delete(pagIndex + 1);
      tx.oncomplete = () => {
        mostraPagelle();
        showNotification('✅ Pagella eliminata', 'success');
      };
    }
  };
}

function calcolaPredizione() {
  const periodo = document.getElementById('predizionePeriodo').value;
  const container = document.getElementById('predizionContent');

  if (!periodo) {
    container.innerHTML = '';
    return;
  }

  const tx = db.transaction(['materie'], 'readonly');
  const store = tx.objectStore('materie');
  const request = store.getAll();

  request.onsuccess = () => {
    const materie = request.result;
    let mediaGenerale = 0;
    let contatore = 0;

    const materieConPredizione = materie.map(m => {
      const voti = getVotiMateria(m);
      const votiPerioodo = filtraVotiPerPerioodo(voti, periodo);
      const media = calcolaMediaMateria(votiPerioodo);
      
      if (media !== null) {
        mediaGenerale += Number(media);
        contatore++;
      }

      return {
        nome: m.nome,
        media: media,
        nVoti: votiPerioodo.length
      };
    }).filter(m => m.media !== null);

    mediaGenerale = contatore > 0 ? (mediaGenerale / contatore).toFixed(2) : 'N/D';

    const bounds = getBoundariesPerioodo(periodo);

    const materieHtml = materieConPredizione.map(m => `
      <div class="pagella-materia-row">
        <span>${m.nome}</span>
        <span style="font-weight: 600; color: var(--primary);">${m.media}</span>
      </div>
    `).join('');

    container.innerHTML = `
      <div class="pagella-card">
        <div class="pagella-header">
          <i class="fas fa-crystal-ball"></i> Pagella Predetta - ${bounds.nome}
        </div>
        <div class="pagella-body">
          <div class="pagella-stats">
            <div class="pagella-stat-box">
              <div class="pagella-stat-label">🔮 Media Predetta</div>
              <div class="pagella-stat-value">${mediaGenerale}</div>
            </div>
            <div class="pagella-stat-box">
              <div class="pagella-stat-label">📚 Materie</div>
              <div class="pagella-stat-value">${materieConPredizione.length}</div>
            </div>
          </div>

          <div class="pagella-materie">
            <h4><i class="fas fa-chart-bar"></i> Medie Attuali per Materia</h4>
            <div class="pagella-materie-list">${materieHtml}</div>
          </div>

          <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border); background: rgba(0, 120, 212, 0.05); padding: 12px; border-radius: 8px;">
            <p style="font-size: 0.9rem; color: var(--text-secondary);">
              <strong>ℹ️ Nota:</strong> Questa è una predizione basata sulla media attuale delle tue materie. La pagella reale potrebbe variare.
            </p>
          </div>
        </div>
      </div>
    `;
  };
}

// ========================
// TODO
// ========================

function aggiungiToDo() {
  const input = document.getElementById('todoInput');
  const ora = document.getElementById('todoOra');
  const testo = input.value.trim();
  const oraInizio = ora.value;

  if (!testo) {
    showNotification('Inserisci un task', 'error');
    return;
  }

  const data = getOggi();

  const tx = db.transaction(['todo'], 'readwrite');
  const store = tx.objectStore('todo');
  store.add({
    testo,
    data,
    oraInizio: oraInizio || '00:00',
    completato: false,
  });

  tx.oncomplete = () => {
    input.value = '';
    ora.value = '';
    caricaToDoOggi();
    showNotification('✅ Task aggiunto', 'success');
  };

  tx.onerror = () => showNotification('Errore', 'error');
}

function completaToDo(id) {
  const tx = db.transaction(['todo'], 'readwrite');
  const store = tx.objectStore('todo');
  const request = store.get(id);

  request.onsuccess = () => {
    const todo = request.result;
    todo.completato = !todo.completato;
    store.put(todo);

    tx.oncomplete = () => caricaToDoOggi();
  };
}

function eliminaToDo(id) {
  const tx = db.transaction(['todo'], 'readwrite');
  const store = tx.objectStore('todo');
  store.delete(id);

  tx.oncomplete = () => {
    caricaToDoOggi();
    showNotification('✅ Eliminato', 'success');
  };
}

function caricaToDoOggi() {
  const oggi = getOggi();
  const container = document.getElementById('todoContent');

  if (!container) return;

  const tx = db.transaction(['todo'], 'readonly');
  const store = tx.objectStore('todo');
  const idx = store.index('data');
  const req = idx.getAll(oggi);

  req.onsuccess = () => {
    let lista = req.result.sort((a, b) => a.oraInizio.localeCompare(b.oraInizio));

    let html = '';
    if (lista.length === 0) {
      html = '<div style="text-align:center; padding: 40px 20px; color: var(--text-light);"><i class="fas fa-inbox"></i><p>Nessun task</p></div>';
    } else {
      html = lista.map(todo => `<li ${todo.completato ? 'style="opacity: 0.6;"' : ''}>
        <div style="flex: 1; display: flex; align-items: center; gap: 12px;">
          <input type="checkbox" ${todo.completato ? 'checked' : ''} onchange="completaToDo(${todo.id})" style="cursor: pointer; width: 18px; height: 18px; accent-color: var(--primary);">
          <div>
            <div style="${todo.completato ? 'text-decoration: line-through; opacity: 0.7;' : 'font-weight: 500;'}">${todo.testo}</div>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">⏰ ${todo.oraInizio}</div>
          </div>
        </div>
        <button class="btn-delete" onclick="eliminaToDo(${todo.id})">
          <i class="fas fa-trash"></i>
        </button>
      </li>`).join('');
    }

    container.innerHTML = html;
  };
}

// ========================
// VERIFICHE
// ========================

function cambiaTabVerifiche(tab) {
  document.querySelectorAll('.verifiche-view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.btn-verifica-tab').forEach(b => b.classList.remove('active'));
  
  if (tab === 'lista') {
    document.getElementById('verificheListaView').classList.add('active');
    document.querySelector('.btn-verifica-tab:first-child').classList.add('active');
  } else {
    document.getElementById('verificheCalendarioView').classList.add('active');
    document.querySelector('.btn-verifica-tab:nth-child(2)').classList.add('active');
    mostraCalendarioVerifiche();
  }
}

function aggiungiVerifica() {
  const materiaId = document.getElementById('verificaMateriaSelect')?.value;
  const data = document.getElementById('verificaData')?.value;
  const tipo = document.getElementById('verificaTipo')?.value;
  const note = document.getElementById('verificaNote')?.value;

  if (!materiaId || !data) {
    showNotification('Seleziona materia e data', 'error');
    return;
  }

  const tx = db.transaction(['verifiche'], 'readwrite');
  const store = tx.objectStore('verifiche');
  store.add({
    materiaId: Number(materiaId),
    data,
    tipo: tipo || 'verifica',
    note: note || '',
  });

  tx.oncomplete = () => {
    document.getElementById('verificaMateriaSelect').value = '';
    document.getElementById('verificaData').value = '';
    document.getElementById('verificaTipo').value = 'verifica';
    document.getElementById('verificaNote').value = '';
    mostraVerificheProssime();
    aggiornaSelectMaterie();
    showNotification('✅ Verifica aggiunta', 'success');
  };

  tx.onerror = () => showNotification('Errore', 'error');
}

function eliminaVerifica(id) {
  const tx = db.transaction(['verifiche'], 'readwrite');
  const store = tx.objectStore('verifiche');
  store.delete(id);

  tx.oncomplete = () => {
    mostraVerificheProssime();
    mostraCalendarioVerifiche();
    showNotification('✅ Eliminato', 'success');
  };
}

function mostraVerificheProssime() {
  const container = document.getElementById('verificheContent');

  if (!container) return;

  const today = new Date(getOggi());

  const tx = db.transaction(['verifiche', 'materie'], 'readonly');
  const verificheStore = tx.objectStore('verifiche');
  const materieStore = tx.objectStore('materie');

  const req = verificheStore.getAll();

  req.onsuccess = () => {
    let verifiche = req.result
      .filter((v) => {
        const vData = new Date(v.data);
        const diffGiorni = Math.floor((vData - today) / (1000 * 60 * 60 * 24));
        return diffGiorni >= 0;
      })
      .sort((a, b) => new Date(a.data) - new Date(b.data));

    const materieReq = materieStore.getAll();
    materieReq.onsuccess = () => {
      const materie = {};
      materieReq.result.forEach((m) => (materie[m.id] = m.nome));

      let listHtml = '';
      if (verifiche.length === 0) {
        listHtml = '<div style="text-align:center; padding: 40px 20px; color: var(--text-light);"><i class="fas fa-inbox"></i><p>Nessuna verifica</p></div>';
      } else {
        listHtml = verifiche
          .map((v) => {
            const diffGiorni = Math.floor((new Date(v.data) - today) / (1000 * 60 * 60 * 24));
            const urgente = diffGiorni <= 7;
            const tipoIcon = {
              'verifica': '📝',
              'interrogazione': '🗣️',
              'test': '✏️',
              'progetto': '🎯'
            };

            return `
              <li style="border-left-color: ${urgente ? '#f44336' : 'var(--primary)'}; background-color: ${urgente ? 'rgba(244, 67, 54, 0.08)' : 'var(--secondary)'};">
                <div style="flex: 1;">
                  <div style="font-weight: 600; margin-bottom: 4px;">
                    ${tipoIcon[v.tipo] || '📅'} ${materie[v.materiaId] || 'Materia'}
                  </div>
                  <div style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 6px;">
                    ${formatData(v.data)}
                  </div>
                  <div style="font-size: 0.85rem; color: var(--text-light);">
                    ${v.tipo.charAt(0).toUpperCase() + v.tipo.slice(1)}${v.note ? ` • ${v.note}` : ''}
                  </div>
                  ${urgente ? `<div style="color: #f44336; font-weight: 600; margin-top: 4px; font-size: 0.85rem;">⚠️ Imminente!</div>` : ''}
                </div>
                <button class="btn-delete" onclick="eliminaVerifica(${v.id})">
                  <i class="fas fa-trash"></i>
                </button>
              </li>
            `;
          })
          .join('');
      }

      container.innerHTML = listHtml;
    };
  };
}

function mostraCalendarioVerifiche() {
  const container = document.getElementById('calendarioContent');
  if (!container) return;

  const tx = db.transaction(['verifiche', 'materie'], 'readonly');
  const verificheStore = tx.objectStore('verifiche');
  const materieStore = tx.objectStore('materie');

  const reqVerifiche = verificheStore.getAll();
  reqVerifiche.onsuccess = () => {
    const verifiche = reqVerifiche.result;
    
    const materieReq = materieStore.getAll();
    materieReq.onsuccess = () => {
      const materie = {};
      materieReq.result.forEach((m) => (materie[m.id] = m.nome));

      const oggi = new Date(getOggi());
      const settimana1 = getSettimanaData(oggi);
      const settimana2 = getSettimanaData(new Date(oggi.getTime() + 7 * 24 * 60 * 60 * 1000));

      const nomiGiorni = getNomiGiorni();
      
      const renderSettimana = (giorni, titolo) => {
        const giorni_html = giorni.map((gg, idx) => {
          const verificheGiorno = verifiche.filter(v => v.data === gg);
          const verificheHtml = verificheGiorno
            .map(v => `<div class="verifica-badge" onclick="eliminaVerifica(${v.id})" title="Click per eliminare: ${materie[v.materiaId]}">${materie[v.materiaId]}</div>`)
            .join('');
          
          const dataParts = gg.split('-');
          const giorno_num = parseInt(dataParts[2]);
          const isOggi = gg === getOggi();

          return `
            <div class="giorno-cell" ${isOggi ? 'style="background: linear-gradient(135deg, rgba(0, 120, 212, 0.1) 0%, rgba(0, 120, 212, 0.05) 100%); border: 2px solid var(--primary);"' : ''}>
              <div class="giorno-nome" ${isOggi ? 'style="color: var(--primary); font-weight: 700;"' : ''}>${nomiGiorni[idx]} ${isOggi ? '📍' : ''}</div>
              <div class="giorno-data">${giorno_num}</div>
              <div class="giorno-verifiche">${verificheHtml || ''}</div>
            </div>
          `;
        }).join('');

        return `
          <div class="settimana-card">
            <div class="settimana-header">${titolo}</div>
            <div class="settimana-grid">${giorni_html}</div>
          </div>
        `;
      };

      const dataInizio1 = new Date(settimana1[0]);
      const dataFine1 = new Date(settimana1[6]);
      const titolo1 = `${dataInizio1.getDate()} - ${dataFine1.getDate()} ${dataFine1.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' })}`;

      const dataInizio2 = new Date(settimana2[0]);
      const dataFine2 = new Date(settimana2[6]);
      const titolo2 = `${dataInizio2.getDate()} - ${dataFine2.getDate()} ${dataFine2.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' })}`;

      container.innerHTML = renderSettimana(settimana1, titolo1) + renderSettimana(settimana2, titolo2);
    };
  };
}

// ========================
// IMPOSTAZIONI
// ========================

function salvaImpostazioni(key, value) {
  const tx = db.transaction(['settings'], 'readwrite');
  const store = tx.objectStore('settings');
  store.put({ key, value });
}

function caricaImpostazioni() {
  const tx = db.transaction(['settings'], 'readonly');
  const store = tx.objectStore('settings');

  // Profilo completo
  const profiloReq = store.get('profilo');
  profiloReq.onsuccess = () => {
    const profilo = profiloReq.result?.value || {};
    document.getElementById('profiloNome').value = profilo.nome || '';
    document.getElementById('profilo Cognome').value = profilo.cognome || '';
    document.getElementById('profiloAnno').value = profilo.anno || '';
    document.getElementById('profiloSezione').value = profilo.sezione || '';
    document.getElementById('profiloScuola').value = profilo.scuola || '';
    
    // Mostra dati nella home
    const nomeCompleto = `${profilo.nome || 'Alessandro'} ${profilo.cognome || 'Preziosi'}`;
    document.getElementById('userName2').textContent = nomeCompleto;
    
    const dataDisplay = `${profilo.anno ? profilo.anno + '° ' : ''}${profilo.sezione ? profilo.sezione + ' • ' : ''}${profilo.scuola || ''}`;
    document.getElementById('profileData').textContent = dataDisplay.trim() || 'Completa il profilo';

    // Carica foto profilo
    if (profilo.foto) {
      const avatar = document.getElementById('avatarDisplay');
      avatar.innerHTML = `<img src="${profilo.foto}" alt="Avatar">`;
      document.getElementById('profiloFotoPreview').src = profilo.foto;
      document.getElementById('profiloFotoPreview').style.display = 'block';
    }
  };

  // Dark Mode
  const themeReq = store.get('darkMode');
  themeReq.onsuccess = () => {
    const isDark = themeReq.result?.value || false;
    applicaTema(isDark);
  };
}

function salvaProfilo() {
  const profilo = {
    nome: document.getElementById('profiloNome').value.trim(),
    cognome: document.getElementById('profilo Cognome').value.trim(),
    anno: document.getElementById('profiloAnno').value,
    sezione: document.getElementById('profiloSezione').value.trim(),
    scuola: document.getElementById('profiloScuola').value.trim()
  };

  if (!profilo.nome || !profilo.cognome) {
    showNotification('Inserisci nome e cognome', 'error');
    return;
  }

  salvaImpostazioni('profilo', profilo);
  const nomeCompleto = `${profilo.nome} ${profilo.cognome}`;
  document.getElementById('userName2').textContent = nomeCompleto;
  
  const dataDisplay = `${profilo.anno ? profilo.anno + '° ' : ''}${profilo.sezione ? profilo.sezione + ' • ' : ''}${profilo.scuola || ''}`;
  document.getElementById('profileData').textContent = dataDisplay.trim() || 'Completa il profilo';
  
  showNotification('✅ Profilo salvato!', 'success');
}

function applicaTema(isDark) {
  if (isDark) {
    document.documentElement.classList.add('dark-mode');
    document.getElementById('darkModeToggle').checked = true;
    document.getElementById('themeStatus').textContent = 'Attivato';
  } else {
    document.documentElement.classList.remove('dark-mode');
    document.getElementById('darkModeToggle').checked = false;
    document.getElementById('themeStatus').textContent = 'Disattivato';
  }
}

function toggleDarkMode() {
  const isDark = document.documentElement.classList.toggle('dark-mode');
  salvaImpostazioni('darkMode', isDark);
  applicaTema(isDark);
  showNotification(`🌙 Tema ${isDark ? 'scuro' : 'chiaro'}!`, 'success');
}

// ========================
// FOTO PROFILO
// ========================

document.getElementById('profiloFoto')?.addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    const fotoData = event.target.result;
    
    // Mostra preview
    document.getElementById('profiloFotoPreview').src = fotoData;
    document.getElementById('profiloFotoPreview').style.display = 'block';
    
    // Salva in profilo
    const tx = db.transaction(['settings'], 'readwrite');
    const store = tx.objectStore('settings');
    const profiloReq = store.get('profilo');
    
    profiloReq.onsuccess = () => {
      const profilo = profiloReq.result?.value || {};
      profilo.foto = fotoData;
      store.put({ key: 'profilo', value: profilo });
      
      // Aggiorna avatar nella home
      const avatar = document.getElementById('avatarDisplay');
      avatar.innerHTML = `<img src="${fotoData}" alt="Avatar">`;
      
      showNotification('✅ Foto profilo salvata!', 'success');
    };
  };
  
  reader.readAsDataURL(file);
});

// ========================
// ESPORTAZIONE/IMPORTAZIONE
// ========================

function esportaDati() {
  Promise.all([
    new Promise((res) => {
      const tx = db.transaction(['materie'], 'readonly');
      tx.objectStore('materie').getAll().onsuccess = (e) => res(e.target.result);
    }),
    new Promise((res) => {
      const tx = db.transaction(['todo'], 'readonly');
      tx.objectStore('todo').getAll().onsuccess = (e) => res(e.target.result);
    }),
    new Promise((res) => {
      const tx = db.transaction(['verifiche'], 'readonly');
      tx.objectStore('verifiche').getAll().onsuccess = (e) => res(e.target.result);
    }),
    new Promise((res) => {
      const tx = db.transaction(['pagelle'], 'readonly');
      tx.objectStore('pagelle').getAll().onsuccess = (e) => res(e.target.result);
    }),
  ]).then(([materie, todo, verifiche, pagelle]) => {
    const data = {
      version: '2.0',
      exportDate: new Date().toISOString(),
      materie,
      todo,
      verifiche,
      pagelle,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `school-companion-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showNotification('✅ Dati esportati!', 'success');
  });
}

function importaDati() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';

  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);

        if (!data.materie || !Array.isArray(data.materie)) {
          throw new Error('File non valido');
        }

        const txMaterie = db.transaction(['materie'], 'readwrite');
        data.materie.forEach((m) => txMaterie.objectStore('materie').add(m));

        const txTodo = db.transaction(['todo'], 'readwrite');
        if (data.todo) data.todo.forEach((t) => txTodo.objectStore('todo').add(t));

        const txVerifiche = db.transaction(['verifiche'], 'readwrite');
        if (data.verifiche) data.verifiche.forEach((v) => txVerifiche.objectStore('verifiche').add(v));

        const txPagelle = db.transaction(['pagelle'], 'readwrite');
        if (data.pagelle) data.pagelle.forEach((p) => txPagelle.objectStore('pagelle').add(p));

        txMaterie.oncomplete = () => {
          mostraMaterie();
          aggiornaSelectMaterie();
          caricaToDoOggi();
          mostraVerificheProssime();
          mostraPagelle();
          showNotification(`✅ ${data.materie.length} materie importate!`, 'success');
        };
      } catch (err) {
        showNotification('❌ File non valido', 'error');
      }
    };

    reader.readAsText(file);
  };

  input.click();
}

// ========================
// NAVIGAZIONE
// ========================

function openSection(section) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  switch (section) {
    case 'voti':
      document.getElementById('votiSection').classList.add('active');
      aggiornaSelectMaterie();
      break;
    case 'statistiche':
      document.getElementById('statisticheSection').classList.add('active');
      mostraStatistiche();
      break;
    case 'pagelle':
      document.getElementById('pagelleSection').classList.add('active');
      cambiaTabPagelle('storico');
      break;
    case 'todo':
      document.getElementById('todoSection').classList.add('active');
      caricaToDoOggi();
      break;
    case 'verifiche':
      document.getElementById('verificheSection').classList.add('active');
      aggiornaSelectMaterie();
      mostraVerificheProssime();
      cambiaTabVerifiche('lista');
      break;
    case 'settings':
      document.getElementById('settingsSection').classList.add('active');
      mostraMaterie();
      break;
  }

  window.scrollTo(0, 0);
}

function closeSection() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('home').classList.add('active');
  window.scrollTo(0, 0);
}

// ========================
// EVENT LISTENERS
// ========================

document.getElementById('votoSlider')?.addEventListener('input', (e) => {
  updateVotoDisplay(e.target.value);
});

document.getElementById('btnAggiungiVoto')?.addEventListener('click', () => {
  const materiaId = document.getElementById('materiaSelect').value;
  const voto = document.getElementById('votoSlider').value;
  aggiungiVoto(materiaId, voto);
});

document.getElementById('materiaSelect')?.addEventListener('change', mostraVoti);

document.getElementById('btnAggiungiMateria')?.addEventListener('click', () => {
  const nome = document.getElementById('settingsNomeMateria').value;
  aggiungiMateria(nome);
});

document.getElementById('settingsNomeMateria')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') document.getElementById('btnAggiungiMateria')?.click();
});

document.getElementById('btnSaveProfilo')?.addEventListener('click', salvaProfilo);

document.getElementById('darkModeToggle')?.addEventListener('change', toggleDarkMode);

document.getElementById('settingsBtn')?.addEventListener('click', () => {
  openSection('settings');
});

document.getElementById('btnEsporta')?.addEventListener('click', esportaDati);
document.getElementById('btnImporta')?.addEventListener('click', importaDati);

console.log('✅ School Companion 2.0 - ULTRA EDITION! 🚀✨');