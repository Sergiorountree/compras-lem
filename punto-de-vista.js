/* ═══ Punto de vista ("Ver como") · código común de las 6 páginas del portal (mig. 097, 8-oct-2026) ═══
   Se publica en la raíz: /punto-de-vista.js?v=097. Cada página lo carga en <head> y lo usa así:
     · LEM_PV.datos(accion, datos)  antes de mandar cualquier llamada (agrega ver_como si hay una vista elegida);
     · LEM_PV.rechazo(respuesta)    al recibirla: si el servidor rechazó la vista devuelve true, borra la vista y recarga la página en la
                                    vista propia SIN cerrar la sesión (la página no sigue: return LEM_PV.pendiente());
     · LEM_PV.iniciar({ api, sinGuardar, descartar, contenedor })  ya con sesión: pide ver_como_opciones y dibuja la barra si el servidor
                                    lo permite. sinGuardar() dice si hay algo capturado que se perdería al cambiar de vista (pide confirmar);
                                    descartar() lo suelta si se acepta perderlo, para que el guardado de salida de la página no lo mande;
     · LEM_PV.cambiando()           true desde que se eligió otra vista hasta que la página se descarga (el guardado de salida no corre);
     · LEM_PV.empresa() / LEM_PV.cambiarEmpresa(emp)   la empresa de la vista; viendo como otro puesto, el selector de Empresa del
                                    módulo cambia la VISTA al mismo puesto en esa empresa (devuelve false sin vista: el módulo sigue igual);
     · LEM_PV.salir()                al cerrar sesión.
   Reglas (decisiones del 8-oct):
     · Solo la cuenta autorizada EN EL SERVIDOR (lem.ver_como_autorizados; hoy sergio@) ve la barra, y el servidor lo revisa en CADA llamada:
       cualquier otra cuenta que mande ver_como recibe sin_acceso y queda en la bitácora. Esta barra solo es la pantalla.
     · La vista vive en sessionStorage 'lem_pv' (se borra al cerrar la pestaña). El navegador manda {puesto, empresa_id, branch_id}; el
       servidor busca la cuenta real. Nunca manda correos.
     · Lecturas exactas (el servidor contesta como esa cuenta). Lo que se guarda queda a nombre de la cuenta real y marcado en la bitácora:
       la franja lo dice en su segundo renglón (también en teléfono) y tras la primera escritura de la página sale un aviso.
     · Limpia una vez las llaves viejas lem_vista* (los navegadores de los dos Óscar pueden tener "gerente" guardado).
   Sin dependencias. Si este archivo no carga, las páginas funcionan igual en la vista propia. */
(function () {
  'use strict';
  if (window.LEM_PV) return;
  var LLAVE = 'lem_pv', LLAVE_OK = 'lem_pv_ok', LLAVE_MSG = 'lem_pv_msg';
  var VIEJAS = ['lem_vista', 'lem_vista_inv', 'lem_vista_nom', 'lem_vista_ven'];
  var PUESTOS = { gerente: 'Gerente de tienda', asesor: 'Asesor', contabilidad: 'Contabilidad', rh: 'Recursos Humanos' };
  var ORDEN = ['gerente', 'asesor', 'contabilidad', 'rh'];

  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); return sessionStorage.getItem(k) === v; } catch (e) { return false; } }
  function ssDel(k) { try { sessionStorage.removeItem(k); } catch (e) { /* almacenamiento bloqueado */ } }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* almacenamiento bloqueado */ } }
  try { VIEJAS.forEach(function (k) { localStorage.removeItem(k); }); } catch (e) { /* almacenamiento bloqueado */ }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function entero(x) { return typeof x === 'number' && isFinite(x) && Math.floor(x) === x && x > 0 && x < 10000; }
  function valida(v) { return !!(v && typeof v === 'object' && PUESTOS.hasOwnProperty(v.puesto) && entero(v.empresa_id) && (v.puesto !== 'gerente' || entero(v.branch_id))); }
  function correoSesion() {
    var t = ssGet('lem_tok'); if (!t) return '';
    try { var b = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); return String(JSON.parse(atob(b + '==='.slice((b.length + 3) % 4))).email || '').toLowerCase(); }
    catch (e) { return ''; }
  }
  function leer() {
    var v = null; try { v = JSON.parse(ssGet(LLAVE) || 'null'); } catch (e) { v = null; }
    if (v && !valida(v)) { ssDel(LLAVE); v = null; }
    return v;
  }
  var PV = leer();            // la vista elegida (o null = la vista propia)
  var OPC = null;             // { api, sinGuardar, contenedor }
  var OPCIONES = null;        // respuesta de ver_como_opciones (solo si permitido)
  var iniciado = false, recargando = false, cambiandoVista = false, panelAbierto = false, prefijoTitulo = '';

  // Una vista elegida por otra cuenta en esta pestaña no se usa (la decide quien la eligió)
  function vigente() {
    if (PV && PV.real) { var em = correoSesion(); if (em && em !== PV.real) { PV = null; ssDel(LLAVE); } }
    return PV;
  }

  /* ── Lo que usan las páginas ── */
  function datos(accion, d) {
    if (!vigente() || accion === 'ver_como_opciones') return d;
    var x = {}, k;
    if (d && typeof d === 'object' && !Array.isArray(d)) for (k in d) if (Object.prototype.hasOwnProperty.call(d, k)) x[k] = d[k];
    x.ver_como = { puesto: PV.puesto, empresa_id: PV.empresa_id };
    if (PV.puesto === 'gerente') x.ver_como.branch_id = PV.branch_id;
    return x;
  }
  function rechazo(j) {
    if (recargando) return true;
    if (!j || typeof j !== 'object' || !j.ver_como_rechazado) { avisarEscritura(j); return false; }
    PV = null; ssDel(LLAVE);
    if (j.ver_como_rechazado === 'rechazado_no_autorizado') ssDel(LLAVE_OK);
    if (ssGet(LLAVE)) return false;     // no se pudo borrar: no se recarga en ciclo; esta página sigue sin vista (PV = null en memoria)
    ssSet(LLAVE_MSG, String(j.detalle || 'El servidor no aceptó el punto de vista: vuelves a tu propia vista.'));
    recargando = true;
    try { location.reload(); } catch (e) { recargando = false; return false; }
    return true;
  }
  var avisoEscrito = false, vistaConfirmada = false;   // vistaConfirmada: el servidor ya marcó una lectura de esta página con ver_como_aplicado
  function avisarEscritura(j) {
    if (!j || typeof j !== 'object' || Array.isArray(j)) return;
    if ('ver_como_aplicado' in j) { vistaConfirmada = true; return; }
    if (avisoEscrito || !vistaConfirmada || j.error || 'permitido' in j) return;
    var v = vigente(), em = correoSesion(); if (!v || !em) return;
    avisoEscrito = true;
    aviso('Guardado a tu nombre (' + corto(em) + ')' + (v.cuenta ? ', no a nombre de ' + corto(v.cuenta) : '') + '. Queda marcado en la bitácora como hecho viendo como ' + etiquetaVista(v) + '.');
  }
  function pendiente() { return new Promise(function () { /* la página se está recargando */ }); }

  /* ── Estilos (una vez) ── */
  function estilos() {
    if (document.getElementById('lem-pv-css')) return;
    var s = document.createElement('style'); s.id = 'lem-pv-css';
    s.textContent =
      '#lem-pv{position:relative;z-index:70;box-sizing:border-box;height:30px;padding:0 8px 0 12px;display:flex;align-items:center;gap:8px;' +
      'font:500 12.5px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#F4F4F5;color:#3F3F46;border-bottom:1px solid #E4E4E7;white-space:nowrap;overflow:hidden;letter-spacing:0}' +
      '#lem-pv.activa{background:#FEF3C7;color:#78350F;border-bottom-color:#F59E0B}' +
      '#lem-pv .pv-t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}' +
      '#lem-pv .pv-t b{font-weight:700}' +
      '#lem-pv.activa{height:44px}#lem-pv.activa .pv-t{display:flex;flex-direction:column;justify-content:center}' +
      '#lem-pv .pv-1,#lem-pv .pv-2{display:block;overflow:hidden;text-overflow:ellipsis;line-height:17px}#lem-pv .pv-2{font-size:12px;font-weight:600}' +
      'html.lem-pv-on.lem-pv-act body>#root{height:calc(100% - 44px)}' +
      '#lem-pv button,#lem-pv-panel button,.lem-pv-card button{font:inherit;font-weight:600;border-radius:6px;padding:2px 9px;cursor:pointer;flex-shrink:0;border:1px solid currentColor;background:transparent;color:inherit}' +
      'html.lem-pv-on body>#root{height:calc(100% - 30px)}' +
      '#lem-pv-panel{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.42);display:flex;align-items:flex-start;justify-content:center;padding:56px 16px 16px;box-sizing:border-box}' +
      '.lem-pv-card{box-sizing:border-box;background:#fff;color:#18181B;border:1px solid #E4E4E7;border-radius:12px;padding:14px 16px;max-width:560px;width:100%;' +
      'font:400 14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;letter-spacing:0;text-align:left}' +
      '.lem-pv-card .pv-tit{font-weight:800;font-size:15px}.lem-pv-card .pv-sub{font-weight:400;font-size:12px;color:#71717A;margin-left:6px}' +
      '.lem-pv-card .pv-campos{display:flex;flex-wrap:wrap;gap:10px;margin:10px 0 6px}' +
      '.lem-pv-card label{display:flex;flex-direction:column;gap:3px;font-size:12px;font-weight:600;color:#52525B;flex:1 1 150px;min-width:0}' +
      '.lem-pv-card select{font:inherit;font-size:14px;font-weight:400;color:#18181B;border:1px solid #D4D4D8;border-radius:8px;padding:6px 8px;background:#fff;max-width:100%}' +
      '.lem-pv-card .pv-nota{font-size:12.5px;color:#52525B;margin:6px 0 10px}' +
      '.lem-pv-card .pv-acc{display:flex;gap:8px;flex-wrap:wrap}' +
      '#lem-pv-panel .pv-acc button,.lem-pv-card .pv-acc button{padding:7px 14px;font-size:14px}#lem-pv-panel .pv-acc .pv-ver,.lem-pv-card .pv-acc .pv-ver{background:#18181B;color:#fff;border-color:#18181B}' +
      '.lem-pv-card .pv-actual{font-size:12.5px;margin-top:6px;color:#78350F;background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:6px 8px}' +
      '#lem-pv-msg{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483001;width:max-content;max-width:min(560px,calc(100% - 32px));box-sizing:border-box;' +
      'background:#18181B;color:#fff;border-radius:10px;padding:10px 14px;font:500 13.5px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}' +
      '#lem-pv .pv-c{display:none}@media (max-width:640px){#lem-pv .pv-l{display:none}#lem-pv .pv-c{display:inline}#lem-pv{padding:0 6px 0 8px;gap:6px}}' +
      '@media print{#lem-pv,#lem-pv-panel,#lem-pv-msg{display:none!important}html.lem-pv-on body>#root,html.lem-pv-on.lem-pv-act body>#root{height:auto}}';
    (document.head || document.documentElement).appendChild(s);
  }
  function aviso(t) {
    if (!document.body) return; estilos();
    var d = document.getElementById('lem-pv-msg'); if (!d) { d = document.createElement('div'); d.id = 'lem-pv-msg'; d.setAttribute('role', 'status'); document.body.appendChild(d); }
    d.textContent = t; clearTimeout(aviso.t); aviso.t = setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 7000);
  }
  function mostrarMensajePendiente() { var m = ssGet(LLAVE_MSG); if (m) { ssDel(LLAVE_MSG); aviso(m); } }

  /* ── Textos ── */
  function etiquetaVista(v) {
    if (!v) return 'Yo';
    return v.etiqueta || (v.puesto === 'gerente' ? 'Gerente · ' + (v.tienda || 'tienda ' + v.branch_id) : PUESTOS[v.puesto]);
  }
  function corto(em) { return String(em || '').replace(/@grupolem\.com\b/i, '@'); }

  /* ── La franja de arriba ── */
  function franja() {
    var em = correoSesion(); if (!document.body || !em) return;
    var v = vigente(), permitido = !!OPCIONES || ssGet(LLAVE_OK) === em;
    var enPortal = !!(OPC && OPC.contenedor);
    var div = document.getElementById('lem-pv');
    if (!v && (!permitido || enPortal)) { if (div) div.parentNode.removeChild(div); document.documentElement.classList.remove('lem-pv-on', 'lem-pv-act'); return; }
    estilos();
    if (!div) { div = document.createElement('div'); div.id = 'lem-pv'; div.setAttribute('role', 'region'); div.setAttribute('aria-label', 'Punto de vista'); document.body.insertBefore(div, document.body.firstChild);
      div.addEventListener('click', function (e) { var b = e.target.closest ? e.target.closest('button[data-pv]') : null; if (!b) return;
        if (b.getAttribute('data-pv') === 'cambiar') abrirPanel(); else if (b.getAttribute('data-pv') === 'mia') aplicar(null); }); }
    document.documentElement.classList.add('lem-pv-on'); document.documentElement.classList.toggle('lem-pv-act', !!v);
    div.className = v ? 'activa' : '';
    // en teléfono (pv-l oculto / pv-c visible) queda "👁 Gerente · Soriana Juventud 2 / ✎ Guardas a tu nombre (sergio@) [Cambiar] [Mi vista]"
    div.innerHTML = v
      ? '<span class="pv-t"><span class="pv-1">👁 <span class="pv-l">Viendo como </span><b>' + esc(etiquetaVista(v)) + '</b><span class="pv-l">' + (v.cuenta ? ' (' + esc(corto(v.cuenta)) + ')' : '') + (v.empresa ? ' · ' + esc(v.empresa) : '') + '</span></span>' +
        '<span class="pv-2">✎ <span class="pv-l">Lo que guardes queda a tu nombre (' + esc(corto(em)) + ') y marcado en la bitácora</span><span class="pv-c">Guardas a tu nombre (' + esc(corto(em)) + ')</span></span></span>' + (permitido ? '<button type="button" data-pv="cambiar">Cambiar</button>' : '') +
        '<button type="button" data-pv="mia"><span class="pv-l">Volver a mi vista</span><span class="pv-c">Mi vista</span></button>'
      : '<span class="pv-t">👁 <span class="pv-l">Punto de vista: </span><b>Yo</b> (' + esc(corto(em)) + ')</span><button type="button" data-pv="cambiar">Cambiar</button>';
    if (v) { var t = '👁 ' + etiquetaVista(v) + ' · '; if (document.title.indexOf(t) !== 0) document.title = t + document.title; prefijoTitulo = t; }
  }

  /* ── El selector (en el portal, dentro de la página; en los módulos, en una ventana) ── */
  var SEL = { emp: null, puesto: 'yo', tienda: null };
  function selInicial() {
    var v = vigente(), emps = (OPCIONES && OPCIONES.empresas) || [];
    var pref = Number(lsGet('lem_empresa')) || null;
    SEL.emp = v ? v.empresa_id : (emps.some(function (e) { return e.empresa_id === pref; }) ? pref : (emps[0] || {}).empresa_id || null);
    SEL.puesto = v ? v.puesto : 'yo';
    SEL.tienda = v && v.puesto === 'gerente' ? v.branch_id : null;
  }
  function opcionesDe(emp, puesto) { return ((OPCIONES && OPCIONES.opciones) || []).filter(function (o) { return o.empresa_id === emp && (!puesto || o.puesto === puesto); }); }
  function elegida() {
    if (SEL.puesto === 'yo') return null;
    var l = opcionesDe(SEL.emp, SEL.puesto);
    if (SEL.puesto === 'gerente') return l.filter(function (o) { return o.branch_id === SEL.tienda; })[0] || null;
    return l[0] || null;
  }
  function htmlCard(enVentana) {
    if (!OPCIONES) return '<div class="lem-pv-card"><div class="pv-tit">👁 Punto de vista</div><p class="pv-nota">Cargando las opciones…</p>' +
      (enVentana ? '<div class="pv-acc"><button type="button" data-pv="cerrar">Cerrar</button></div>' : '') + '</div>';
    var emps = OPCIONES.empresas || [];
    if (!emps.some(function (x) { return x.empresa_id === SEL.emp; })) selInicial();
    var puestos = ORDEN.filter(function (p) { return opcionesDe(SEL.emp, p).length; });
    if (SEL.puesto !== 'yo' && puestos.indexOf(SEL.puesto) < 0) SEL.puesto = 'yo';
    var tiendas = opcionesDe(SEL.emp, 'gerente');
    if (SEL.puesto === 'gerente' && !tiendas.some(function (o) { return o.branch_id === SEL.tienda; })) SEL.tienda = (tiendas[0] || {}).branch_id || null;
    var op = function (v, t, sel) { return '<option value="' + esc(v) + '"' + (sel ? ' selected' : '') + '>' + esc(t) + '</option>'; };
    var v = vigente(), e = elegida();
    var h = '<div class="lem-pv-card"><div class="pv-tit">👁 Punto de vista<span class="pv-sub">solo tú lo ves · se borra al cerrar la pestaña</span></div><div class="pv-campos">' +
      '<label>Empresa<select data-pv="emp">' + emps.map(function (x) { return op(x.empresa_id, x.nombre, x.empresa_id === SEL.emp); }).join('') + '</select></label>' +
      '<label>Ver como<select data-pv="puesto">' + op('yo', 'Yo (Administrador)', SEL.puesto === 'yo') +
        puestos.map(function (p) { return op(p, (OPCIONES.puestos || []).filter(function (x) { return x.puesto === p; }).map(function (x) { return x.nombre; })[0] || PUESTOS[p], SEL.puesto === p); }).join('') + '</select></label>' +
      (SEL.puesto === 'gerente' ? '<label>Tienda<select data-pv="tienda">' + tiendas.map(function (o) { return op(o.branch_id, o.tienda || o.etiqueta, o.branch_id === SEL.tienda); }).join('') + '</select></label>' : '') +
      '</div><p class="pv-nota">' + (e ? 'Verás exactamente lo que ve <b>' + esc(corto(e.cuenta)) + '</b> (' + esc(e.etiqueta) + '), en ' + esc((e.modulos || []).length) + ' módulo' + ((e.modulos || []).length === 1 ? '' : 's') +
        '. Lo que guardes queda a <b>tu</b> nombre y marcado en la bitácora.' : 'Tu propia vista de administrador. La empresa elegida es con la que abren los módulos.') + '</p>' +
      (v ? '<div class="pv-actual">Ahora: viendo como ' + esc(etiquetaVista(v)) + (v.cuenta ? ' (' + esc(corto(v.cuenta)) + ')' : '') + '</div>' : '') +
      '<div class="pv-acc" style="margin-top:10px"><button type="button" class="pv-ver" data-pv="ver">' + (e ? 'Ver así' : (v ? 'Volver a mi vista' : 'Usar esta empresa')) + '</button>' +
      (enVentana ? '<button type="button" data-pv="cerrar">Cancelar</button>' : '') + '</div></div>';
    return h;
  }
  function enlazar(raiz, enVentana) {
    if (raiz.getAttribute('data-pv-enlazado')) return; raiz.setAttribute('data-pv-enlazado', '1');
    raiz.addEventListener('change', function (ev) {
      var k = ev.target.getAttribute('data-pv'); if (!k) return;
      if (k === 'emp') { SEL.emp = Number(ev.target.value); SEL.tienda = null; }
      else if (k === 'puesto') { SEL.puesto = ev.target.value; SEL.tienda = null; }
      else if (k === 'tienda') SEL.tienda = Number(ev.target.value);
      pintarCard(raiz, enVentana);
    });
    raiz.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('button[data-pv]') : null; if (!b) { if (enVentana && ev.target === raiz) cerrarPanel(); return; }
      var k = b.getAttribute('data-pv');
      if (k === 'cerrar') cerrarPanel();
      else if (k === 'ver') aplicar(elegida(), SEL.emp);
    });
  }
  function pintarCard(raiz, enVentana) { raiz.innerHTML = htmlCard(enVentana); }
  function abrirPanel() {
    if (!document.body) return; estilos(); selInicial();
    var p = document.getElementById('lem-pv-panel');
    if (!p) { p = document.createElement('div'); p.id = 'lem-pv-panel'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-modal', 'true'); p.setAttribute('aria-label', 'Punto de vista'); document.body.appendChild(p); }
    enlazar(p, true); pintarCard(p, true); panelAbierto = true;
    if (!OPCIONES) pedirOpciones();
  }
  function cerrarPanel() { var p = document.getElementById('lem-pv-panel'); if (p) p.parentNode.removeChild(p); panelAbierto = false; }
  function pintarPortal() {
    if (!OPC || !OPC.contenedor) return;
    var c = typeof OPC.contenedor === 'string' ? document.getElementById(OPC.contenedor) : OPC.contenedor;
    if (!c) return;
    if (!OPCIONES) { c.innerHTML = ''; return; }
    estilos(); enlazar(c, false); pintarCard(c, false);
  }

  /* ── Elegir / volver ── */
  function aplicar(o, emp) {
    var descartar = false;
    if (OPC && typeof OPC.sinGuardar === 'function') {
      var sucio = false; try { sucio = !!OPC.sinGuardar(); } catch (e) { sucio = false; }
      if (sucio && !window.confirm('Tienes cambios sin guardar en esta pantalla. ¿Cambiar el punto de vista y perderlos?')) return;
      descartar = sucio;
    }
    if (o) {
      var v = { puesto: o.puesto, empresa_id: o.empresa_id, etiqueta: o.etiqueta, cuenta: o.cuenta, tienda: o.tienda || null, real: correoSesion(),
                empresa: (((OPCIONES && OPCIONES.empresas) || []).filter(function (x) { return x.empresa_id === o.empresa_id; })[0] || {}).nombre || '' };
      if (o.puesto === 'gerente') v.branch_id = o.branch_id;
      if (!valida(v) || !ssSet(LLAVE, JSON.stringify(v))) { window.alert('El navegador no deja guardar el punto de vista (almacenamiento de la pestaña bloqueado).'); return; }
      lsSet('lem_empresa', String(o.empresa_id));
    } else {
      ssDel(LLAVE);
      if (entero(emp)) lsSet('lem_empresa', String(emp));
    }
    // La vista vieja se queda en memoria (PV) hasta que la página se descargue: lo que salga antes va con la vista con la que se hizo.
    // Si aceptó perder los cambios, la página los suelta (OPC.descartar) para que su guardado de salida no los mande.
    recargando = true; cambiandoVista = true;
    if (descartar && OPC && typeof OPC.descartar === 'function') { try { OPC.descartar(); } catch (e) { /* la página sigue con su guardado */ } }
    // al módulo desde su inicio: la ruta de un puesto puede no existir en otro
    try { location.assign(location.pathname + location.search); } catch (e) { location.reload(); }
  }

  /* ── La empresa de la vista ──
     Viendo como una cuenta de varias empresas (Contabilidad, RH) la empresa es parte de la vista: el módulo abre en la de la vista (no en
     lem_empresa, que comparten todas las pestañas) y su selector de Empresa cambia la VISTA al mismo puesto en esa empresa y recarga, para
     que la franja, lem_pv y la bitácora digan la empresa que se está viendo. Sin vista: false, y el módulo cambia la empresa como siempre. */
  function empresa() { var v = vigente(); return v ? v.empresa_id : null; }
  function cambiarEmpresa(emp) {
    var v = vigente(); if (!v) return false;
    emp = Number(emp); if (emp === v.empresa_id) return true;
    var o = v.puesto === 'gerente' ? null : (opcionesDe(emp, v.puesto)[0] || null);
    if (!o) { if (!OPCIONES) pedirOpciones(); aviso(OPCIONES ? 'Ese puesto no tiene cuenta en esa empresa: elige otra vista con "Cambiar".' : 'Todavía no cargan las opciones del punto de vista; vuelve a intentar.'); return true; }
    aplicar(o); return true;
  }

  /* ── Opciones del servidor ── */
  var pidiendo = null;
  function pedirOpciones() {
    if (!OPC || typeof OPC.api !== 'function' || pidiendo) return pidiendo;
    pidiendo = Promise.resolve().then(function () { return OPC.api('ver_como_opciones', {}); }).then(function (r) {
      pidiendo = null;
      if (r && r.permitido === true) { OPCIONES = r; ssSet(LLAVE_OK, String(r.usuario || correoSesion())); }
      else { OPCIONES = null; ssDel(LLAVE_OK); cerrarPanel(); }
      franja(); pintarPortal(); if (panelAbierto) { var p = document.getElementById('lem-pv-panel'); if (p) pintarCard(p, true); }
    }, function () { pidiendo = null; /* sin conexión: la franja se queda como estaba */ });
    return pidiendo;
  }
  function iniciar(o) {
    OPC = o || OPC || {};
    if (!iniciado) { iniciado = true; mostrarMensajePendiente(); }
    franja(); pintarPortal();
    if (!OPCIONES) pedirOpciones();
  }
  function refrescar() { franja(); pintarPortal(); }
  function salir() {
    PV = null; OPCIONES = null; ssDel(LLAVE); ssDel(LLAVE_OK); cerrarPanel();
    var d = document.getElementById('lem-pv'); if (d) d.parentNode.removeChild(d);
    document.documentElement.classList.remove('lem-pv-on', 'lem-pv-act');
    if (prefijoTitulo && document.title.indexOf(prefijoTitulo) === 0) document.title = document.title.slice(prefijoTitulo.length);
    prefijoTitulo = '';
  }
  // La franja de una vista elegida sale en cuanto hay página (antes de la primera respuesta): que nunca parezca la vista propia
  function alCargar() { if (vigente() && correoSesion()) franja(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', alCargar); else alCargar();

  window.LEM_PV = Object.freeze({
    vista: function () { var v = vigente(); return v ? JSON.parse(JSON.stringify(v)) : null; },
    datos: datos, rechazo: rechazo, pendiente: pendiente, iniciar: iniciar, refrescar: refrescar, salir: salir,
    abrir: abrirPanel, cambiando: function () { return cambiandoVista; }, empresa: empresa, cambiarEmpresa: cambiarEmpresa, version: '097'
  });
})();
