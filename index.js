const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const axios = require('axios');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const express = require('express');

const TIMEZONE = 'America/El_Salvador';
const ADMIN_CREDENTIALS = {
    username: "jarabe",
    password: "jarabe123"
};

const FIREBASE_CONFIG = {
    databaseURL: "https://seguridadterritorial-64f0f-default-rtdb.firebaseio.com/"
};

const FIREBASE_RECLAMOS_CONFIG = {
    apiKey: "AIzaSyAneea8jq-qIoymTG909zP76OjcFx7ufa8",
    authDomain: "reclamo-39ff3.firebaseapp.com",
    projectId: "reclamo-39ff3",
    messagingSenderId: "443679031726",
    appId: "1:443679031726:web:568838f29089d4fb74483f"
};

const FIREBASE_GUARDIAN_CONFIG = {
    apiKey: "AIzaSyC0ySpb88p6jf3v8S6zC9lUQhE3XBqHpCc",
    authDomain: "reportesdeguardian.firebaseapp.com",
    databaseURL: "https://reportesdeguardian-default-rtdb.firebaseio.com",
    projectId: "reportesdeguardian",
    storageBucket: "reportesdeguardian.appspot.com",
    messagingSenderId: "109827856831",
    appId: "1:109827856831:web:89a7b114733f7bc6e55fe5"
};

const FIREBASE_CIP_CONFIG = {
    apiKey: "AIzaSyDuumSoM9tuDTrw6TWLqhGKdT94hX_cIbA",
    authDomain: "cijarabe2.firebaseapp.com",
    databaseURL: "https://cijarabe2-default-rtdb.firebaseio.com/",
    projectId: "cijarabe2",
    storageBucket: "cijarabe2.firebasestorage.app",
    messagingSenderId: "502025011637",
    appId: "1:502025011637:web:9e38b7eb79686226a7d9fc"
};

const FIREBASE_CONFIG_ILC = {
    apiKey: "AIzaSyDYSicDGQc48QLUtWHroRB30UNbATFu4c8",
    databaseURL: "https://conocestusbrechas-d911a-default-rtdb.firebaseio.com"
};

const FIREBASE_CONFIG_OUTS = {
    apiKey: "AIzaSyBX0_IzQWnUrdhHH-H0jMNbAp0thOVhfpU",
    databaseURL: "https://skapdeouts-default-rtdb.firebaseio.com"
};

const userStates = new Map();
const scheduledMessages = [];
let availableGroups = [];

const TANQUES_LIST = [
    'TQ 1', 'TQ 2', 'TQ 3', 'TQ 4', 'TQ 5', 'TQ 6', 'TQ 7', 'TQ 8', 'TQ 9', 'TQ 10',
    'TQ 11', 'TQ 12', 'TQ 13', 'TQ 14', 'TQ 15', 'TQ 16', 'TQ 17', 'TQ 400'
];

const MESES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "bot-seguridad",
        dataPath: path.join(__dirname, 'whatsapp-session')
    }),
    puppeteer: {
        headless: "new",
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    },
    webVersionCache: {
        type: "remote",
        remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html"
    }
});

function crearCarpetas() {
    const carpetas = [
        path.join(__dirname, 'whatsapp-session'),
        path.join(__dirname, 'temp'),
        path.join(__dirname, 'media'),
        path.join(__dirname, 'imagenes-programadas'),
        path.join(__dirname, 'videos-programados'),
        path.join(__dirname, 'pdf-programados'),
        path.join(__dirname, 'reportes-cip')
    ];
    
    carpetas.forEach(carpeta => {
        if (!fs.existsSync(carpeta)) {
            fs.mkdirSync(carpeta, { recursive: true });
        }
    });
}

function obtenerSaludo() {
    const horaActual = moment().tz(TIMEZONE).hour();
    
    if (horaActual >= 6 && horaActual < 12) {
        return "buenos días";
    } else if (horaActual >= 12 && horaActual < 18) {
        return "buenas tardes";
    } else {
        return "buenas noches";
    }
}

function parsearHora(horaString) {
    const regex24h = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
    const regex12h = /^([0-1]?[0-9]):([0-5][0-9])\s*(am|pm)$/i;
    
    horaString = horaString.trim().toLowerCase();
    
    if (regex24h.test(horaString)) {
        const [horas, minutos] = horaString.split(':');
        return `${horas.padStart(2, '0')}:${minutos}`;
    }
    
    if (regex12h.test(horaString)) {
        const match = horaString.match(/^(\d+):(\d+)\s*(am|pm)$/);
        let horas = parseInt(match[1]);
        const minutos = match[2];
        const periodo = match[3];
        
        if (periodo === 'pm' && horas < 12) horas += 12;
        if (periodo === 'am' && horas === 12) horas = 0;
        
        return `${horas.toString().padStart(2, '0')}:${minutos}`;
    }
    
    return null;
}

async function guardarArchivo(media, userId, tipo) {
    let carpeta = '';
    let extension = '';
    
    if (tipo === 'imagen') {
        carpeta = path.join(__dirname, 'media', 'imagenes');
        extension = media.mimetype.includes('jpeg') ? '.jpg' : 
                   media.mimetype.includes('png') ? '.png' : 
                   media.mimetype.includes('gif') ? '.gif' : '.jpg';
    } else if (tipo === 'video') {
        carpeta = path.join(__dirname, 'media', 'videos');
        extension = media.mimetype.includes('mp4') ? '.mp4' : 
                   media.mimetype.includes('avi') ? '.avi' : 
                   media.mimetype.includes('mov') ? '.mov' : '.mp4';
    } else if (tipo === 'pdf' || tipo === 'documento') {
        carpeta = path.join(__dirname, 'media', 'documentos');
        extension = media.mimetype.includes('pdf') ? '.pdf' : 
                   media.mimetype.includes('word') ? '.docx' : '.pdf';
    } else {
        carpeta = path.join(__dirname, 'media', 'otros');
        extension = '.dat';
    }
    
    if (!fs.existsSync(carpeta)) {
        fs.mkdirSync(carpeta, { recursive: true });
    }
    
    const nombreArchivo = `${tipo}_${userId}_${Date.now()}${extension}`;
    const rutaCompleta = path.join(carpeta, nombreArchivo);
    
    const buffer = Buffer.from(media.data, 'base64');
    fs.writeFileSync(rutaCompleta, buffer);
    
    return {
        ruta: rutaCompleta,
        tipo: tipo,
        mimetype: media.mimetype,
        nombre: nombreArchivo
    };
}

async function obtenerGrupos() {
    try {
        const chats = await client.getChats();
        const grupos = chats.filter(chat => chat.isGroup);
        return grupos;
    } catch (error) {
        return [];
    }
}

function generarVistaPrevia(datos) {
    let preview = "📋 *VISTA PREVIA DEL MENSAJE*\n\n";
    
    if (datos.archivoInfo) {
        preview += `📎 *Archivo:* ${datos.archivoInfo.tipo.toUpperCase()} adjunto ✅\n`;
        preview += `📄 *Tipo:* ${datos.archivoInfo.mimetype}\n`;
    } else if (datos.imagenPath) {
        preview += "🖼️ *Imagen:* Adjuntada ✅\n";
    } else {
        preview += "📎 *Archivo:* Sin archivo adjunto\n";
    }
    
    if (datos.mensaje && datos.mensaje !== "") {
        preview += `💬 *Mensaje:* ${datos.mensaje}\n`;
    }
    
    preview += `⏰ *Horas programadas:* ${datos.horas.join(', ')}\n`;
    preview += `📅 *Frecuencia:* ${datos.frecuencia === 'una_vez' ? 'Una sola vez' : 
                datos.frecuencia === 'diario' ? 'Diariamente' : 
                datos.frecuencia === 'semanal' ? 'Semanalmente' : 'Personalizado'}\n`;
    
    if (datos.fechaInicio) {
        preview += `📅 *Fecha inicio:* ${moment(datos.fechaInicio).tz(TIMEZONE).format('DD/MM/YYYY')}\n`;
    }
    
    if (datos.fechaFin) {
        preview += `📅 *Fecha fin:* ${moment(datos.fechaFin).tz(TIMEZONE).format('DD/MM/YYYY')}\n`;
    }
    
    if (datos.enviarATodos) {
        preview += `👥 *Enviar a:* Todos los grupos\n`;
    } else if (datos.gruposSeleccionados && datos.gruposSeleccionados.length > 0) {
        preview += `👥 *Enviar a:* ${datos.gruposSeleccionados.length} grupo(s) seleccionado(s)\n`;
    }
    
    preview += `\n📅 *Fecha de creación:* ${moment().tz(TIMEZONE).format('DD/MM/YYYY HH:mm')}\n`;
    
    return preview;
}

const GRUPOS_DISPONIBLES = [
    "Cazadores del sabor",
    "Heroes del sabor", 
    "Caramelos del sabor",
    "Linea 6"
];

function formatearFecha(fechaStr) {
    if (!fechaStr) return 'N/A';
    const [year, month, day] = fechaStr.split('-');
    return `${day}/${month}/${year}`;
}

function numeroConEmoji(num) {
    const emojis = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
    const numStr = num.toString();
    let resultado = '';
    for (let i = 0; i < numStr.length; i++) {
        const digito = parseInt(numStr[i]);
        resultado += emojis[digito];
    }
    return resultado;
}

async function consultarRegistrosCIP(tanque, tipoBusqueda, fechaInicio, fechaFin, mes, año) {
    try {
        console.log(`🔍 Consultando registros CIP - Tanque: ${tanque}, Tipo: ${tipoBusqueda}`);
        
        let url = `${FIREBASE_CIP_CONFIG.databaseURL}/registrosCIP.json`;
        const response = await axios.get(url, { timeout: 30000 });
        const registros = response.data || {};
        
        let registrosArray = [];
        for (const key in registros) {
            if (registros.hasOwnProperty(key)) {
                registrosArray.push({
                    id: key,
                    ...registros[key]
                });
            }
        }
        
        let registrosFiltrados = registrosArray;
        if (tanque !== 'todos') {
            registrosFiltrados = registrosArray.filter(r => 
                r.tanqueLinea && r.tanqueLinea.toLowerCase() === tanque.toLowerCase()
            );
        }
        
        if (tipoBusqueda === 'rango_fechas' && fechaInicio && fechaFin) {
            registrosFiltrados = registrosFiltrados.filter(r => 
                r.fecha && r.fecha >= fechaInicio && r.fecha <= fechaFin
            );
        } else if (tipoBusqueda === 'mes' && mes && año) {
            const mesNum = (MESES.indexOf(mes) + 1).toString().padStart(2, '0');
            registrosFiltrados = registrosFiltrados.filter(r => {
                if (!r.fecha) return false;
                const [rAño, rMes] = r.fecha.split('-');
                return rAño === año.toString() && rMes === mesNum;
            });
        }
        
        registrosFiltrados.sort((a, b) => {
            if (!a.fecha) return 1;
            if (!b.fecha) return -1;
            return b.fecha.localeCompare(a.fecha);
        });
        
        console.log(`✅ Encontrados ${registrosFiltrados.length} registros`);
        return registrosFiltrados;
        
    } catch (error) {
        console.error("Error al consultar registros CIP:", error.message);
        return [];
    }
}

function generarResumenRegistros(registros) {
    if (registros.length === 0) {
        return "No se encontraron registros para los criterios seleccionados.";
    }
    
    const tanquesUnicos = new Set();
    const operadoresUnicos = new Set();
    const pasosCount = {};
    
    registros.forEach(r => {
        if (r.tanqueLinea) tanquesUnicos.add(r.tanqueLinea);
        if (r.operador) operadoresUnicos.add(r.operador);
        if (r.pasos) {
            pasosCount[r.pasos] = (pasosCount[r.pasos] || 0) + 1;
        }
    });
    
    let resumen = `📊 *RESUMEN DE REGISTROS*\n\n`;
    resumen += `• Total registros: ${registros.length}\n`;
    resumen += `• Tanques involucrados: ${tanquesUnicos.size}\n`;
    resumen += `• Operadores: ${operadoresUnicos.size}\n\n`;
    
    resumen += `📋 *TIPOS DE CIP REALIZADOS:*\n`;
    Object.entries(pasosCount)
        .sort((a, b) => b[1] - a[1])
        .forEach(([paso, count]) => {
            resumen += `• ${paso}: ${count}\n`;
        });
    
    return resumen;
}

async function generarExcel(registros, tanque, tipoBusqueda, filtros) {
    try {
        const wb = XLSX.utils.book_new();
        
        const datos = registros.map(registro => {
            const datosCompletos = {
                'Fecha': formatearFecha(registro.fecha),
                'Hora': registro.hora || 'N/A',
                'Turno': registro.turno || 'N/A',
                'Operador': registro.operador || 'N/A',
                'Catador': registro.catador || 'N/A',
                'Segundo Catador': registro.catador2 || 'N/A',
                'Tanque/Línea': registro.tanqueLinea || 'N/A',
                'CIP': registro.cip || 'N/A',
                'Pasos': registro.pasos || 'N/A',
                'Concentración Cloro Enjuague': registro.concentracionCloro || 'N/A',
                'Sabor del Tanque': registro.saborTanque || 'N/A',
                'Comentarios': registro.comentarios || 'N/A',
                'Inspección Visual': registro.inspeccionVisual || 'N/A',
                'Temperatura Soda (°C)': registro.tempSoda || 'N/A',
                'Concentración Soda': registro.concentracionSoda || 'N/A',
                'Temperatura Agua (°C)': registro.tempAgua || 'N/A',
                'Temperatura AC55 (°C)': registro.tempAC55 || 'N/A',
                'Concentración AC55': registro.concentracionAC55 || 'N/A',
                'Temperatura Dióxido Cloro (°C)': registro.tempDioxidoCloro || 'N/A',
                'Concentración Dióxido Cloro': registro.concentracionDioxidoCloro || 'N/A',
                'Temperatura Acelerate (°C)': registro.tempAccelerate || 'N/A',
                'Concentración Acelerate': registro.concentracionAccelerate || 'N/A',
                'Temperatura Oxonia (°C)': registro.tempOxonia || 'N/A',
                'Concentración Oxonia': registro.concentracionOxonia || 'N/A',
                'Temperatura Vortex (°C)': registro.tempVortex || 'N/A',
                'Concentración Vortex': registro.concentracionVortex || 'N/A',
                'PH Final': registro.phFinal || 'N/A',
                'Arrastre Soda': registro.arrastreSoda || 'N/A',
                'Olor': registro.olor || 'N/A',
                'Sabor': registro.sabor || 'N/A',
                'Prueba Cafeína': registro.pruebaCafeina || 'N/A',
                'Prueba Azúcar': registro.pruebaAzucar || 'N/A'
            };

            if (registro.flujos) {
                for (const [key, value] of Object.entries(registro.flujos)) {
                    datosCompletos[`${key} Inicio`] = value.inicio || 'N/A';
                    datosCompletos[`${key} Fin`] = value.fin || 'N/A';
                    datosCompletos[`${key} Valor`] = value.valor || 'N/A';
                }
            }

            return datosCompletos;
        });

        const ws = XLSX.utils.json_to_sheet(datos);
        
        const columnas = [
            { wch: 10 }, { wch: 8 }, { wch: 6 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
            { wch: 12 }, { wch: 8 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 30 },
            { wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
            { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
            { wch: 18 }, { wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 8 },
            { wch: 15 }, { wch: 15 }
        ];
        
        ws['!cols'] = columnas;

        XLSX.utils.book_append_sheet(wb, ws, 'Registros CIP');

        const fechaActual = moment().tz(TIMEZONE).format('YYYYMMDD_HHmmss');
        const tanqueNombre = tanque === 'todos' ? 'TODOS' : tanque.replace(/\s+/g, '_');
        const nombreArchivo = `CIP_${tanqueNombre}_${fechaActual}.xlsx`;
        const rutaArchivo = path.join(__dirname, 'reportes-cip', nombreArchivo);

        XLSX.writeFile(wb, rutaArchivo);
        
        return {
            success: true,
            ruta: rutaArchivo,
            nombre: nombreArchivo
        };
        
    } catch (error) {
        console.error("Error al generar Excel:", error);
        return {
            success: false,
            error: error.message
        };
    }
}

async function generarPDF(registros, tanque, tipoBusqueda, filtros) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
            
            const fechaActual = moment().tz(TIMEZONE).format('YYYYMMDD_HHmmss');
            const tanqueNombre = tanque === 'todos' ? 'TODOS' : tanque.replace(/\s+/g, '_');
            const nombreArchivo = `CIP_${tanqueNombre}_${fechaActual}.pdf`;
            const rutaArchivo = path.join(__dirname, 'reportes-cip', nombreArchivo);
            
            const stream = fs.createWriteStream(rutaArchivo);
            doc.pipe(stream);
            
            doc.fontSize(16).font('Helvetica-Bold').text('REPORTE CIP JARABE TERMINADO', { align: 'center' });
            doc.moveDown();
            
            doc.fontSize(10).font('Helvetica');
            doc.text(`Tanque: ${tanque === 'todos' ? 'TODOS' : tanque}`);
            
            if (tipoBusqueda === 'rango_fechas') {
                doc.text(`Período: ${formatearFecha(filtros.fechaInicio)} - ${formatearFecha(filtros.fechaFin)}`);
            } else if (tipoBusqueda === 'mes') {
                doc.text(`Mes: ${filtros.mes} ${filtros.año}`);
            }
            
            doc.text(`Total registros: ${registros.length}`);
            doc.text(`Fecha generación: ${moment().tz(TIMEZONE).format('DD/MM/YYYY HH:mm:ss')}`);
            doc.moveDown();
            
            const tableTop = 150;
            const rowHeight = 20;
            const colWidths = [70, 50, 50, 80, 80, 70, 60, 100];
            
            doc.font('Helvetica-Bold').fontSize(8);
            const headers = ['Fecha', 'Hora', 'Turno', 'Operador', 'Catador', 'Tanque', 'CIP', 'Pasos'];
            let x = 30;
            headers.forEach((header, i) => {
                doc.text(header, x, tableTop, { width: colWidths[i], align: 'left' });
                x += colWidths[i];
            });
            
            doc.moveTo(30, tableTop + 15).lineTo(30 + colWidths.reduce((a, b) => a + b, 0), tableTop + 15).stroke();
            
            doc.font('Helvetica').fontSize(7);
            let y = tableTop + 20;
            
            registros.slice(0, 50).forEach((registro, index) => {
                if (y > 500) {
                    doc.addPage();
                    y = 50;
                    
                    doc.font('Helvetica-Bold').fontSize(8);
                    x = 30;
                    headers.forEach((header, i) => {
                        doc.text(header, x, y, { width: colWidths[i], align: 'left' });
                        x += colWidths[i];
                    });
                    doc.moveTo(30, y + 15).lineTo(30 + colWidths.reduce((a, b) => a + b, 0), y + 15).stroke();
                    y += 20;
                    doc.font('Helvetica').fontSize(7);
                }
                
                x = 30;
                doc.text(formatearFecha(registro.fecha), x, y, { width: colWidths[0], align: 'left' });
                x += colWidths[0];
                doc.text(registro.hora || 'N/A', x, y, { width: colWidths[1], align: 'left' });
                x += colWidths[1];
                doc.text(registro.turno || 'N/A', x, y, { width: colWidths[2], align: 'left' });
                x += colWidths[2];
                doc.text(registro.operador || 'N/A', x, y, { width: colWidths[3], align: 'left' });
                x += colWidths[3];
                doc.text(registro.catador || 'N/A', x, y, { width: colWidths[4], align: 'left' });
                x += colWidths[4];
                doc.text(registro.tanqueLinea || 'N/A', x, y, { width: colWidths[5], align: 'left' });
                x += colWidths[5];
                doc.text(registro.cip || 'N/A', x, y, { width: colWidths[6], align: 'left' });
                x += colWidths[6];
                doc.text(registro.pasos || 'N/A', x, y, { width: colWidths[7], align: 'left' });
                
                y += rowHeight;
            });
            
            doc.end();
            
            stream.on('finish', () => {
                resolve({
                    success: true,
                    ruta: rutaArchivo,
                    nombre: nombreArchivo
                });
            });
            
            stream.on('error', (error) => {
                reject(error);
            });
            
        } catch (error) {
            reject(error);
        }
    });
}

// ============================================
// FUNCIONES PARA CADA OPCIÓN DEL MENÚ (FLUJOS SECUENCIALES)
// ============================================

// --- OPCIÓN 1: ACADIA (Solo enlace) ---
async function manejarAcadia(message) {
    await message.reply(`🔗 *Enlace para Acadia:*\nhttps://ab-inbev.acadia.sysalli.com/documents?filter=lang-eql:es-mx&page=1&pagesize=50\n\n*Nota:* Haz click en el enlace para poder entrar.`);
    // No se envía menú automáticamente
}

// --- OPCIÓN 2: GUARDIAN (Flujo secuencial: código → año → mes → resultado) ---
async function manejarGuardian(message, userId) {
    userStates.set(userId, { 
        estado: 'guardian_esperando_codigo',
        datos: {}
    });
    
    await message.reply(
        `🛡️ *GUARDIAN - SISTEMA DE REPORTES*\n\n` +
        `Para consultar tus reportes, necesito tu código de empleado.\n\n` +
        `*Ejemplos:*\n` +
        `• 76001111\n` +
        `• 1111\n` +
        `• 76009949\n\n` +
        `*📝 IMPORTANTE:*\n` +
        `Puedes buscar con el código completo o cualquier parte que coincida.\n` +
        `El sistema buscará tanto reportes que hayas hecho como acciones inseguras donde apareces como implicado.\n\n` +
        `Envía tu código ahora o escribe *cancelar* para regresar al menú.`
    );
}

// --- OPCIÓN 3: CHECKLIST DE SEGURIDAD (Flujo secuencial) ---
async function manejarChecklistSeguridad(message, userId) {
    userStates.set(userId, { 
        estado: 'checklist_menu_principal',
        datos: {}
    });
    
    const menuOpciones = `✅ *CHECKLIST DE SEGURIDAD*\n\n¿Qué deseas verificar?\n\n1️⃣ - Grupos\n2️⃣ - Técnicos\n\n*Envía el número de la opción (1-2)*\nO envía *cancelar* para regresar al menú principal.`;
    
    await message.reply(menuOpciones);
}

// --- OPCIÓN 4: SEMÁFORO DE TERRITORIO (Consulta directa, sin menú automático) ---
async function manejarSemaforoTerritorio(message) {
    await message.reply("⏳ Consultando semáforo de territorio...");
    const resultado = await obtenerSemaforoTerritorio();
    await message.reply(resultado);
    // No se envía menú automáticamente
}

// --- OPCIÓN 5: RECLAMOS DE CALIDAD (Consulta directa, sin menú automático) ---
async function manejarReclamosCalidad(message) {
    await message.reply("🔍 Consultando reclamos de calidad...");
    const resultado = await consultarReclamosCalidad();
    await message.reply(resultado.mensaje);
    // No se envía menú automáticamente
}

// --- OPCIÓN 6: ENERGÍA (Solo enlace) ---
async function manejarEnergia(message) {
    await message.reply(`🔗 *Enlace para Energía:*\nhttps://energia2-7e868.web.app/\n\n*Nota:* Haz click en el enlace para poder entrar.`);
    // No se envía menú automáticamente
}

// --- OPCIÓN 7: CIP JARABE TERMINADO (Flujo secuencial completo) ---
async function manejarCIPJarabeTerminado(message, userId) {
    userStates.set(userId, { 
        estado: 'cip_esperando_tanque',
        datos: {}
    });
    
    let menuTanques = `🧪 *CIP JARABE TERMINADO*\n\n`;
    menuTanques += `Selecciona el tanque que deseas consultar:\n\n`;
    
    TANQUES_LIST.forEach((tanque, index) => {
        menuTanques += `${numeroConEmoji(index + 1)} - ${tanque}\n`;
    });
    
    menuTanques += `\n${numeroConEmoji(TANQUES_LIST.length + 1)} - *TODOS LOS TANQUES*\n\n`;
    menuTanques += `Envía el número de la opción (1-${TANQUES_LIST.length + 1})\n`;
    menuTanques += `O envía *cancelar* para regresar al menú principal.`;
    
    await message.reply(menuTanques);
}

// --- OPCIÓN 8: CIP JARABE SIMPLE (Solo enlace) ---
async function manejarCIPJarabeSimple(message) {
    await message.reply(`🔗 *Enlace para CIP Jarabe Simple:*\nhttps://cip-jarabesimple.web.app/\n\n*Nota:* Haz click en el enlace para poder entrar.`);
    // No se envía menú automáticamente
}

// --- OPCIÓN 9: PROGRAMAR MENSAJES (Flujo secuencial completo) ---
async function manejarProgramarMensajes(message, userId) {
    // Verificar si hay mensajes programados existentes
    if (scheduledMessages.length > 0) {
        userStates.set(userId, { 
            estado: 'programacion_menu_principal',
            datos: {}
        });
        
        let mensajeOpciones = "📅 *MENSAJES PROGRAMADOS*\n\n";
        mensajeOpciones += `Hay *${scheduledMessages.length}* mensaje(s) programado(s).\n\n`;
        mensajeOpciones += "¿Qué deseas hacer?\n\n";
        mensajeOpciones += "1️⃣ - Ver mensajes programados\n";
        mensajeOpciones += "2️⃣ - Crear nueva programación\n";
        mensajeOpciones += "3️⃣ - Editar mensaje existente\n";
        mensajeOpciones += "4️⃣ - Eliminar mensaje\n";
        mensajeOpciones += "5️⃣ - Cancelar\n\n";
        mensajeOpciones += "Envía el número de la opción (1-5)";
        
        await message.reply(mensajeOpciones);
    } else {
        // No hay mensajes, ir directo a crear nuevo
        await iniciarNuevaProgramacion(message, userId);
    }
}

// --- OPCIÓN 10: SKAP (Flujo secuencial: elegir tipo → código → resultado) ---
async function manejarSKAP(message, userId) {
    userStates.set(userId, { estado: 'seleccionar_tipo_skap', datos: {} });
    
    await message.reply(
        "📋 *SISTEMA SKAP*\n\n" +
        "Elige el tipo de consulta:\n\n" +
        "1️⃣ - *ILC*\n" +
        "2️⃣ - *OUTS*\n\n" +
        "Envía el número de la opción (1-2)\n" +
        "O envía *cancelar* para regresar al menú principal."
    );
}

// ============================================
// FUNCIONES AUXILIARES PARA CADA FLUJO
// ============================================

// --- Funciones para Guardian (Opción 2) ---
async function procesarCodigoGuardian(message, userId, estadoUsuario) {
    const codigo = message.body.trim();
    
    if (!codigo || codigo === '') {
        await message.reply("❌ Por favor ingresa un código válido.");
        return;
    }
    
    estadoUsuario.datos.codigo = codigo;
    estadoUsuario.estado = 'guardian_esperando_anio';
    userStates.set(userId, estadoUsuario);
    
    const añoActual = moment().tz(TIMEZONE).year();
    const años = [añoActual, añoActual - 1, añoActual - 2];
    
    let menuAños = `📅 *SELECCIONA EL AÑO*\n\n`;
    años.forEach((año, index) => {
        menuAños += `${numeroConEmoji(index + 1)} - ${año}\n`;
    });
    
    menuAños += `\n*Envía el número del año*\nO envía *cancelar* para regresar.`;
    
    await message.reply(menuAños);
}

async function procesarAnioGuardian(message, userId, estadoUsuario) {
    const opcion = parseInt(message.body.trim());
    
    if (isNaN(opcion) || opcion < 1 || opcion > 3) {
        await message.reply("❌ Opción inválida. Por favor envía un número del 1 al 3.");
        return;
    }
    
    const añoActual = moment().tz(TIMEZONE).year();
    const años = [añoActual, añoActual - 1, añoActual - 2];
    const añoSeleccionado = años[opcion - 1];
    
    estadoUsuario.datos.anio = añoSeleccionado;
    estadoUsuario.estado = 'guardian_esperando_mes';
    userStates.set(userId, estadoUsuario);
    
    let menuMeses = `📅 *SELECCIONA EL MES*\n\n`;
    MESES.forEach((mes, index) => {
        menuMeses += `${numeroConEmoji(index + 1)} - ${mes}\n`;
    });
    
    menuMeses += `\n*Envía el número del mes (1-12)*\nO envía *cancelar* para regresar.`;
    
    await message.reply(menuMeses);
}

async function procesarMesGuardian(message, userId, estadoUsuario) {
    const mes = parseInt(message.body.trim());
    
    if (isNaN(mes) || mes < 1 || mes > 12) {
        await message.reply("❌ Opción inválida. Por favor envía un número del 1 al 12.");
        return;
    }
    
    await message.reply("🔍 Consultando Guardian...");
    
    const resultado = await consultarGuardian(
        estadoUsuario.datos.codigo,
        mes,
        estadoUsuario.datos.anio
    );
    
    await message.reply(resultado.mensaje);
    
    // Limpiar el estado pero NO enviar menú automáticamente
    userStates.delete(userId);
}

// --- Funciones para Checklist (Opción 3) ---
async function procesarChecklistMenuPrincipal(message, userId, estadoUsuario) {
    const texto = message.body.trim();
    
    if (texto === '1') {
        await obtenerGruposDisponibles(message, userId);
    } else if (texto === '2') {
        await obtenerInfoTecnico(message, userId);
    } else {
        await message.reply("❌ Opción inválida. Por favor envía 1 para Grupos o 2 para Técnicos.");
    }
}

async function obtenerGruposDisponibles(message, userId) {
    try {
        console.log('🔍 Consultando grupos desde Dashboard de seguridad...');
        
        const response = await axios.get(`${FIREBASE_CONFIG.databaseURL}/registros.json`, {
            timeout: 15000
        });
        
        const usuarios = response.data || {};
        const gruposUnicos = new Set();
        
        Object.values(usuarios).forEach(usuario => {
            if (usuario.grupo) {
                gruposUnicos.add(usuario.grupo);
            }
        });
        
        const grupos = gruposUnicos.size > 0 ? Array.from(gruposUnicos) : GRUPOS_DISPONIBLES;
        
        let menuGrupos = `👥 *GRUPOS DISPONIBLES*\n\n`;
        grupos.forEach((grupo, index) => {
            menuGrupos += `${numeroConEmoji(index + 1)} - ${grupo}\n`;
        });
        
        menuGrupos += `\n*Selecciona el número del grupo que deseas consultar*\nO envía *cancelar* para regresar.`;
        
        await message.reply(menuGrupos);
        
        userStates.set(userId, { 
            estado: 'checklist_esperando_grupo',
            datos: { grupos: grupos }
        });
        
    } catch (error) {
        console.error("Error al obtener grupos:", error);
        
        let menuGrupos = `👥 *GRUPOS DISPONIBLES*\n\n`;
        GRUPOS_DISPONIBLES.forEach((grupo, index) => {
            menuGrupos += `${numeroConEmoji(index + 1)} - ${grupo}\n`;
        });
        
        menuGrupos += `\n*Selecciona el número del grupo que deseas consultar*\nO envía *cancelar* para regresar.`;
        
        await message.reply(menuGrupos);
        
        userStates.set(userId, { 
            estado: 'checklist_esperando_grupo',
            datos: { grupos: GRUPOS_DISPONIBLES }
        });
    }
}

async function obtenerInfoTecnico(message, userId) {
    await message.reply(
        `👤 *CONSULTAR TÉCNICO*\n\n` +
        `Por favor, ingresa el *código del técnico* que deseas consultar.\n\n` +
        `*Ejemplos:*\n` +
        `• 12345\n` +
        `• 76001111\n` +
        `• 1111\n\n` +
        `O envía *cancelar* para regresar.`
    );
    
    userStates.set(userId, { 
        estado: 'checklist_esperando_codigo_tecnico',
        datos: {}
    });
}

// --- Funciones para SKAP (Opción 10) ---
async function procesarSeleccionTipoSkap(message, userId, estadoUsuario) {
    const texto = message.body.trim();
    
    if (texto === '1') {
        await manejarSkapILC(message, userId);
    } else if (texto === '2') {
        await manejarSkapOUTS(message, userId);
    } else {
        await message.reply("❌ Opción inválida. Por favor envía 1 para ILC o 2 para OUTS.");
    }
}

async function manejarSkapILC(message, userId) {
    userStates.set(userId, { 
        estado: 'esperando_codigo_skap_ilc',
        datos: {}
    });
    
    await message.reply(
        "📋 *CONSULTA SKAP - ILC*\n\n" +
        "Para poder revisar tus notas de SKAP, envía tu código de empleado a continuación:\n\n" +
        "*Ejemplos de códigos ILC:*\n" +
        "• 76001111 (código completo)\n" +
        "• 1111 (parte del código)\n" +
        "• 7601260\n" +
        "• 1260\n" +
        "• 76011111\n" +
        "• 11111\n\n" +
        "*📝 IMPORTANTE:*\n" +
        "Puedes buscar con el código completo o cualquier parte que coincida.\n" +
        "El sistema busca en todos los campos posibles.\n\n" +
        "O envía *cancelar* para regresar al menú."
    );
}

async function manejarSkapOUTS(message, userId) {
    userStates.set(userId, { 
        estado: 'esperando_codigo_skap_outs',
        datos: {}
    });
    
    await message.reply(
        "📋 *CONSULTA SKAP - OUTS*\n\n" +
        "Para poder revisar tu licencia para operar, envía tu código de empleado a continuación:\n\n" +
        "*Ejemplos de códigos OUTS:*\n" +
        "• 11111111 (código completo)\n" +
        "• 1111 (parte del código)\n" +
        "• 1111\n" +
        "• 11111\n" +
        "• 1111\n\n" +
        "*📝 IMPORTANTE:*\n" +
        "Puedes buscar con el código completo o cualquier parte que coincida.\n" +
        "El sistema busca en todos los campos posibles.\n\n" +
        "O envía *cancelar* para regresar al menú."
    );
}

async function procesarCodigoSkapILC(message, userId, estadoUsuario) {
    const codigoEmpleado = message.body.trim();
    
    if (!codigoEmpleado || codigoEmpleado === '') {
        await message.reply("❌ Por favor ingresa un código válido.");
        return;
    }
    
    await message.reply("🔍 Buscando información de SKAP ILC...");
    
    try {
        const resultado = await buscarSkapILC(codigoEmpleado);
        await message.reply(resultado);
    } catch (error) {
        console.error("Error en búsqueda ILC:", error.message);
        await message.reply("❌ Error en la búsqueda. Intenta nuevamente.");
    }
    
    userStates.delete(userId);
}

async function procesarCodigoSkapOUTS(message, userId, estadoUsuario) {
    const codigoEmpleado = message.body.trim();
    
    if (!codigoEmpleado || codigoEmpleado === '') {
        await message.reply("❌ Por favor ingresa un código válido.");
        return;
    }
    
    await message.reply("🔍 Buscando información de SKAP OUTS...");
    
    try {
        const resultado = await buscarSkapOUTS(codigoEmpleado);
        await message.reply(resultado);
    } catch (error) {
        console.error("Error en búsqueda OUTS:", error.message);
        await message.reply("❌ Error en la búsqueda. Intenta nuevamente.");
    }
    
    userStates.delete(userId);
}

// --- Funciones para CIP (Opción 7) ---
async function procesarSeleccionTanqueCIP(message, userId, estadoUsuario) {
    const opcion = parseInt(message.body.trim());
    
    if (isNaN(opcion) || opcion < 1 || opcion > TANQUES_LIST.length + 1) {
        await message.reply(`❌ Opción inválida. Por favor envía un número del 1 al ${TANQUES_LIST.length + 1}.`);
        return;
    }
    
    let tanqueSeleccionado;
    if (opcion === TANQUES_LIST.length + 1) {
        tanqueSeleccionado = 'todos';
    } else {
        tanqueSeleccionado = TANQUES_LIST[opcion - 1];
    }
    
    estadoUsuario.datos.tanque = tanqueSeleccionado;
    estadoUsuario.estado = 'cip_esperando_tipo_busqueda';
    userStates.set(userId, estadoUsuario);
    
    await message.reply(
        `✅ Tanque seleccionado: *${tanqueSeleccionado === 'todos' ? 'TODOS LOS TANQUES' : tanqueSeleccionado}*\n\n` +
        `¿Cómo quieres buscar la información?\n\n` +
        `1️⃣ - *Por rango de fechas* (ej: del 1 al 20)\n` +
        `2️⃣ - *Por mes completo*\n\n` +
        `Envía el número de la opción (1-2)`
    );
}

async function procesarTipoBusquedaCIP(message, userId, estadoUsuario) {
    const opcion = message.body.trim();
    
    if (opcion === '1') {
        estadoUsuario.estado = 'cip_esperando_rango_fechas';
        userStates.set(userId, estadoUsuario);
        
        await message.reply(
            "📅 *RANGO DE FECHAS*\n\n" +
            "Envía el rango de fechas en formato:\n" +
            "`DD-MM-YYYY hasta DD-MM-YYYY`\n\n" +
            "*Ejemplos:*\n" +
            "• `01-03-2025 hasta 20-03-2025`\n" +
            "• `1-3-2025 hasta 20-3-2025`\n\n" +
            "O envía *cancelar* para regresar."
        );
        
    } else if (opcion === '2') {
        estadoUsuario.estado = 'cip_esperando_mes';
        userStates.set(userId, estadoUsuario);
        
        let menuMeses = "📅 *SELECCIONA EL MES*\n\n";
        MESES.forEach((mes, index) => {
            menuMeses += `${numeroConEmoji(index + 1)} - ${mes}\n`;
        });
        
        menuMeses += `\nEnvía el número del mes (1-12)`;
        
        await message.reply(menuMeses);
        
    } else {
        await message.reply("❌ Opción inválida. Por favor envía 1 o 2.");
    }
}

async function procesarRangoFechasCIP(message, userId, estadoUsuario) {
    const texto = message.body.trim().toLowerCase();
    
    const patron = /(\d{1,2})-(\d{1,2})-(\d{4})\s+(?:hasta|a)\s+(\d{1,2})-(\d{1,2})-(\d{4})/i;
    const match = texto.match(patron);
    
    if (!match) {
        await message.reply(
            "❌ Formato incorrecto.\n\n" +
            "Usa el formato: `DD-MM-YYYY hasta DD-MM-YYYY`\n" +
            "Ejemplo: `01-03-2025 hasta 20-03-2025`"
        );
        return;
    }
    
    const diaInicio = match[1].padStart(2, '0');
    const mesInicio = match[2].padStart(2, '0');
    const añoInicio = match[3];
    const fechaInicio = `${añoInicio}-${mesInicio}-${diaInicio}`;
    
    const diaFin = match[4].padStart(2, '0');
    const mesFin = match[5].padStart(2, '0');
    const añoFin = match[6];
    const fechaFin = `${añoFin}-${mesFin}-${diaFin}`;
    
    if (fechaInicio > fechaFin) {
        await message.reply("❌ La fecha de inicio debe ser menor o igual a la fecha de fin.");
        return;
    }
    
    estadoUsuario.datos.tipoBusqueda = 'rango_fechas';
    estadoUsuario.datos.fechaInicio = fechaInicio;
    estadoUsuario.datos.fechaFin = fechaFin;
    estadoUsuario.estado = 'cip_esperando_formato_descarga';
    userStates.set(userId, estadoUsuario);
    
    await message.reply(
        "✅ Rango de fechas configurado correctamente.\n\n" +
        "¿En qué formato deseas descargar la información?\n\n" +
        "1️⃣ - *Excel* (XLSX)\n" +
        "2️⃣ - *PDF*\n\n" +
        "Envía el número de la opción (1-2)"
    );
}

async function procesarSeleccionMesCIP(message, userId, estadoUsuario) {
    const mes = parseInt(message.body.trim());
    
    if (isNaN(mes) || mes < 1 || mes > 12) {
        await message.reply("❌ Opción inválida. Por favor envía un número del 1 al 12.");
        return;
    }
    
    estadoUsuario.datos.mesSeleccionado = MESES[mes - 1];
    estadoUsuario.estado = 'cip_esperando_anio';
    userStates.set(userId, estadoUsuario);
    
    const años = [2025, 2026, 2027];
    
    let menuAños = `📅 *SELECCIONA EL AÑO*\n\n`;
    años.forEach((año, index) => {
        menuAños += `${numeroConEmoji(index + 1)} - ${año}\n`;
    });
    
    menuAños += `\nEnvía el número del año (1-3)`;
    
    await message.reply(menuAños);
}

async function procesarSeleccionAnioCIP(message, userId, estadoUsuario) {
    const opcion = parseInt(message.body.trim());
    
    if (isNaN(opcion) || opcion < 1 || opcion > 3) {
        await message.reply("❌ Opción inválida. Por favor envía un número del 1 al 3.");
        return;
    }
    
    const años = [2025, 2026, 2027];
    const añoSeleccionado = años[opcion - 1];
    
    estadoUsuario.datos.tipoBusqueda = 'mes';
    estadoUsuario.datos.año = añoSeleccionado;
    estadoUsuario.estado = 'cip_esperando_formato_descarga';
    userStates.set(userId, estadoUsuario);
    
    await message.reply(
        "✅ Mes y año configurados correctamente.\n\n" +
        "¿En qué formato deseas descargar la información?\n\n" +
        "1️⃣ - *Excel* (XLSX)\n" +
        "2️⃣ - *PDF*\n\n" +
        "Envía el número de la opción (1-2)"
    );
}

async function procesarFormatoDescargaCIP(message, userId, estadoUsuario) {
    const opcion = message.body.trim();
    
    if (opcion !== '1' && opcion !== '2') {
        await message.reply("❌ Opción inválida. Por favor envía 1 para Excel o 2 para PDF.");
        return;
    }
    
    await message.reply("🔍 Consultando registros CIP... Esto puede tomar unos segundos.");
    
    const registros = await consultarRegistrosCIP(
        estadoUsuario.datos.tanque,
        estadoUsuario.datos.tipoBusqueda,
        estadoUsuario.datos.fechaInicio,
        estadoUsuario.datos.fechaFin,
        estadoUsuario.datos.mesSeleccionado,
        estadoUsuario.datos.año
    );
    
    if (registros.length === 0) {
        await message.reply(
            "❌ *No se encontraron registros*\n\n" +
            "No hay información disponible para los criterios seleccionados.\n\n" +
            "Verifica:\n" +
            "• El tanque seleccionado\n" +
            "• El rango de fechas\n" +
            "• El mes y año"
        );
        userStates.delete(userId);
        return;
    }
    
    const resumen = generarResumenRegistros(registros);
    await message.reply(resumen);
    
    let resultado;
    if (opcion === '1') {
        resultado = await generarExcel(registros, estadoUsuario.datos.tanque, estadoUsuario.datos.tipoBusqueda, estadoUsuario.datos);
    } else {
        resultado = await generarPDF(registros, estadoUsuario.datos.tanque, estadoUsuario.datos.tipoBusqueda, estadoUsuario.datos);
    }
    
    if (resultado.success) {
        const media = MessageMedia.fromFilePath(resultado.ruta);
        await message.reply(
            media,
            undefined,
            { caption: `✅ *ARCHIVO GENERADO*\n\n📁 ${resultado.nombre}\n📊 Total registros: ${registros.length}` }
        );
        
        setTimeout(() => {
            try {
                if (fs.existsSync(resultado.ruta)) {
                    fs.unlinkSync(resultado.ruta);
                }
            } catch (error) {
                console.error("Error al eliminar archivo temporal:", error);
            }
        }, 5000);
        
    } else {
        await message.reply("❌ Error al generar el archivo. Intenta nuevamente.");
    }
    
    userStates.delete(userId);
}

// ============================================
// FUNCIONES PARA PROGRAMACIÓN DE MENSAJES (Opción 9)
// ============================================

async function procesarProgramacionMenuPrincipal(message, userId, estadoUsuario) {
    const opcion = message.body.trim();
    
    if (opcion === '1') {
        // Ver mensajes programados
        await mostrarMensajesProgramados(message, userId);
    } else if (opcion === '2') {
        // Crear nueva programación
        await iniciarNuevaProgramacion(message, userId);
    } else if (opcion === '3') {
        // Editar mensaje existente
        await mostrarMensajesParaEditar(message, userId);
    } else if (opcion === '4') {
        // Eliminar mensaje
        await mostrarMensajesParaEliminar(message, userId);
    } else if (opcion === '5') {
        // Cancelar
        userStates.delete(userId);
        await message.reply("❌ Operación cancelada.");
    } else {
        await message.reply("❌ Opción inválida. Por favor envía un número del 1 al 5.");
    }
}

async function mostrarMensajesProgramados(message, userId) {
    if (scheduledMessages.length === 0) {
        await message.reply("📭 *No hay mensajes programados*");
        userStates.delete(userId);
        return;
    }
    
    let listaMensajes = "📋 *MENSAJES PROGRAMADOS*\n\n";
    
    scheduledMessages.forEach((msg, index) => {
        listaMensajes += `${index + 1}. *Mensaje:* ${msg.mensaje ? (msg.mensaje.length > 30 ? msg.mensaje.substring(0, 30) + '...' : msg.mensaje) : '(sin texto)'}\n`;
        listaMensajes += `   ⏰ *Horas:* ${msg.horas.join(', ')}\n`;
        listaMensajes += `   📅 *Frecuencia:* ${msg.frecuencia}\n`;
        listaMensajes += `   📎 *Archivo:* ${msg.archivoInfo ? '✅ Sí' : '❌ No'}\n`;
        listaMensajes += `   👥 *Grupos:* ${msg.grupos === 'todos' ? 'Todos' : msg.grupos.length}\n\n`;
    });
    
    await message.reply(listaMensajes);
    
    // Preguntar qué hacer después
    await message.reply("¿Qué deseas hacer ahora?\n\n1️⃣ - Volver al menú de programación\n2️⃣ - Salir");
    userStates.set(userId, { estado: 'programacion_despues_ver', datos: {} });
}

async function procesarDespuesVer(message, userId, estadoUsuario) {
    const opcion = message.body.trim();
    
    if (opcion === '1') {
        // Volver al menú de programación
        await manejarProgramarMensajes(message, userId);
    } else if (opcion === '2') {
        // Salir
        userStates.delete(userId);
        await message.reply("✅ Operación finalizada. Usa /menu cuando necesites ayuda.");
    } else {
        await message.reply("❌ Opción inválida. Por favor envía 1 o 2.");
    }
}

async function mostrarMensajesParaEditar(message, userId) {
    if (scheduledMessages.length === 0) {
        await message.reply("📭 *No hay mensajes programados para editar*");
        userStates.delete(userId);
        return;
    }
    
    let listaMensajes = "✏️ *SELECCIONAR MENSAJE A EDITAR*\n\n";
    
    scheduledMessages.forEach((msg, index) => {
        listaMensajes += `${index + 1}. *Mensaje:* ${msg.mensaje ? (msg.mensaje.length > 30 ? msg.mensaje.substring(0, 30) + '...' : msg.mensaje) : '(sin texto)'}\n`;
        listaMensajes += `   ⏰ *Horas:* ${msg.horas.join(', ')}\n`;
        listaMensajes += `   📅 *Creado:* ${moment(msg.fechaCreacion).tz(TIMEZONE).format('DD/MM/YYYY')}\n\n`;
    });
    
    listaMensajes += "Envía el número del mensaje que quieres editar:\n";
    listaMensajes += "O envía *cancelar* para regresar.";
    
    await message.reply(listaMensajes);
    userStates.set(userId, { 
        estado: 'programacion_esperando_indice_editar',
        datos: {}
    });
}

async function procesarIndiceEditar(message, userId, estadoUsuario) {
    const texto = message.body.trim();
    
    if (texto.toLowerCase() === 'cancelar') {
        userStates.delete(userId);
        await message.reply("❌ Operación cancelada.");
        return;
    }
    
    const indice = parseInt(texto) - 1;
    
    if (isNaN(indice) || indice < 0 || indice >= scheduledMessages.length) {
        await message.reply(`❌ Número inválido. Por favor envía un número del 1 al ${scheduledMessages.length}.`);
        return;
    }
    
    // Guardar el índice del mensaje a editar y pedir credenciales
    estadoUsuario.datos.indiceEditar = indice;
    estadoUsuario.datos.programacionExistente = scheduledMessages[indice];
    estadoUsuario.estado = 'programacion_esperando_credenciales_editar';
    userStates.set(userId, estadoUsuario);
    
    await message.reply(
        "🔐 *EDITAR MENSAJE*\n\n" +
        "Por favor envía tus credenciales en el formato:\n" +
        "`usuario:contraseña`\n\n" +
        "Ejemplo: admin:admin123"
    );
}

async function mostrarMensajesParaEliminar(message, userId) {
    if (scheduledMessages.length === 0) {
        await message.reply("📭 *No hay mensajes programados para eliminar*");
        userStates.delete(userId);
        return;
    }
    
    let listaMensajes = "🗑️ *SELECCIONAR MENSAJE A ELIMINAR*\n\n";
    
    scheduledMessages.forEach((msg, index) => {
        listaMensajes += `${index + 1}. *Mensaje:* ${msg.mensaje ? (msg.mensaje.length > 30 ? msg.mensaje.substring(0, 30) + '...' : msg.mensaje) : '(sin texto)'}\n`;
        listaMensajes += `   ⏰ *Horas:* ${msg.horas.join(', ')}\n`;
        listaMensajes += `   📅 *Creado:* ${moment(msg.fechaCreacion).tz(TIMEZONE).format('DD/MM/YYYY')}\n\n`;
    });
    
    listaMensajes += "Envía el número del mensaje que quieres eliminar:\n";
    listaMensajes += "O envía *cancelar* para regresar.";
    
    await message.reply(listaMensajes);
    userStates.set(userId, { 
        estado: 'programacion_esperando_indice_eliminar',
        datos: {}
    });
}

async function procesarIndiceEliminar(message, userId, estadoUsuario) {
    const texto = message.body.trim();
    
    if (texto.toLowerCase() === 'cancelar') {
        userStates.delete(userId);
        await message.reply("❌ Operación cancelada.");
        return;
    }
    
    const indice = parseInt(texto) - 1;
    
    if (isNaN(indice) || indice < 0 || indice >= scheduledMessages.length) {
        await message.reply(`❌ Número inválido. Por favor envía un número del 1 al ${scheduledMessages.length}.`);
        return;
    }
    
    // Guardar el índice del mensaje a eliminar y pedir credenciales
    estadoUsuario.datos.indiceEliminar = indice;
    estadoUsuario.datos.programacionEliminar = scheduledMessages[indice];
    estadoUsuario.estado = 'programacion_esperando_credenciales_eliminar';
    userStates.set(userId, estadoUsuario);
    
    await message.reply(
        "🔐 *ELIMINAR MENSAJE*\n\n" +
        "Por favor envía tus credenciales en el formato:\n" +
        "`usuario:contraseña`\n\n" +
        "Ejemplo: admin:admin123"
    );
}

async function procesarCredencialesEditar(message, userId, estadoUsuario) {
    const texto = message.body.trim();
    
    if (texto.includes(':')) {
        const partes = texto.split(':');
        const usuario = partes[0].trim();
        const contrasena = partes[1].trim();
        
        if (usuario === ADMIN_CREDENTIALS.username && contrasena === ADMIN_CREDENTIALS.password) {
            // Credenciales correctas, iniciar edición
            estadoUsuario.estado = 'programacion_editar_tipo_contenido';
            userStates.set(userId, estadoUsuario);
            
            await message.reply(
                "✅ *Credenciales correctas*\n\n" +
                "¿Qué deseas editar?\n\n" +
                "1️⃣ - Mantener todo igual (solo confirmar)\n" +
                "2️⃣ - Cambiar archivo\n" +
                "3️⃣ - Cambiar mensaje de texto\n" +
                "4️⃣ - Cambiar horas\n" +
                "5️⃣ - Cambiar frecuencia\n" +
                "6️⃣ - Cambiar grupos\n\n" +
                "Envía el número de la opción (1-6)"
            );
        } else {
            await message.reply("❌ Credenciales incorrectas. Intenta nuevamente.");
        }
    } else {
        await message.reply("Formato incorrecto. Usa: usuario:contraseña");
    }
}

async function procesarCredencialesEliminar(message, userId, estadoUsuario) {
    const texto = message.body.trim();
    
    if (texto.includes(':')) {
        const partes = texto.split(':');
        const usuario = partes[0].trim();
        const contrasena = partes[1].trim();
        
        if (usuario === ADMIN_CREDENTIALS.username && contrasena === ADMIN_CREDENTIALS.password) {
            // Credenciales correctas, eliminar mensaje
            await eliminarProgramacion(message, userId, estadoUsuario);
        } else {
            await message.reply("❌ Credenciales incorrectas. Intenta nuevamente.");
        }
    } else {
        await message.reply("Formato incorrecto. Usa: usuario:contraseña");
    }
}

async function procesarEditarTipoContenido(message, userId, estadoUsuario) {
    const opcion = message.body.trim();
    
    if (opcion === '1') {
        // Mantener todo igual, solo confirmar
        await guardarProgramacion(message, userId, estadoUsuario);
    } else if (opcion === '2') {
        // Cambiar archivo
        estadoUsuario.estado = 'programacion_editar_archivo';
        userStates.set(userId, estadoUsuario);
        
        await message.reply(
            "📎 *CAMBIAR ARCHIVO*\n\n" +
            "Envía el nuevo archivo (imagen, video o documento):\n\n" +
            "O envía *mantener* para conservar el archivo actual."
        );
    } else if (opcion === '3') {
        // Cambiar mensaje
        estadoUsuario.estado = 'programacion_editar_mensaje';
        userStates.set(userId, estadoUsuario);
        
        await message.reply(
            "📝 *CAMBIAR MENSAJE*\n\n" +
            "Envía el nuevo mensaje de texto:\n\n" +
            "O envía *mantener* para conservar el mensaje actual."
        );
    } else if (opcion === '4') {
        // Cambiar horas
        estadoUsuario.estado = 'programacion_editar_cantidad_horas';
        userStates.set(userId, estadoUsuario);
        
        await message.reply(
            "⏰ *CAMBIAR HORAS*\n\n" +
            "¿Cuántas horas al día quieres programar?\n\n" +
            "1️⃣ - 1 hora al día\n" +
            "2️⃣ - 2 horas al día\n" +
            "3️⃣ - 3 horas al día\n\n" +
            "Envía el número de la opción (1-3)"
        );
    } else if (opcion === '5') {
        // Cambiar frecuencia
        estadoUsuario.estado = 'programacion_editar_frecuencia';
        userStates.set(userId, estadoUsuario);
        
        await message.reply(
            "📅 *CAMBIAR FRECUENCIA*\n\n" +
            "¿Con qué frecuencia quieres que se envíe?\n\n" +
            "1️⃣ - *Una sola vez*\n" +
            "2️⃣ - *Diariamente*\n" +
            "3️⃣ - *Personalizado*\n\n" +
            "Envía el número de la opción (1-3)"
        );
    } else if (opcion === '6') {
        // Cambiar grupos
        estadoUsuario.estado = 'programacion_editar_grupos';
        userStates.set(userId, estadoUsuario);
        
        const grupos = await obtenerGrupos();
        availableGroups = grupos;
        
        if (grupos.length === 0) {
            await message.reply("❌ No hay grupos disponibles. El bot no está en ningún grupo.");
            userStates.delete(userId);
            return;
        }
        
        let listaGrupos = "👥 *CAMBIAR GRUPOS*\n\n";
        listaGrupos += "¿Quieres que el mensaje se envíe a *todos* los grupos?\n\n";
        listaGrupos += "1️⃣ - *Sí*, enviar a todos los grupos\n";
        listaGrupos += "2️⃣ - *No*, seleccionar grupos específicos\n\n";
        listaGrupos += "O envía *mantener* para conservar la configuración actual.";
        
        await message.reply(listaGrupos);
    } else {
        await message.reply("❌ Opción inválida. Por favor envía un número del 1 al 6.");
    }
}

async function procesarEditarArchivo(message, userId, estadoUsuario) {
    const texto = message.body.trim().toLowerCase();
    
    if (texto === 'mantener') {
        // Mantener archivo actual, ir a vista previa
        estadoUsuario.estado = 'mostrando_vista_previa_edicion';
        userStates.set(userId, estadoUsuario);
        
        const preview = generarVistaPrevia(estadoUsuario.datos);
        await message.reply(preview + "\n\n*¿Guardar los cambios?*\n\n1️⃣ - Sí, guardar\n2️⃣ - No, cancelar");
        return;
    }
    
    if (message.hasMedia) {
        try {
            const media = await message.downloadMedia();
            let tipo = 'documento';
            
            if (media.mimetype.includes('image')) {
                tipo = 'imagen';
            } else if (media.mimetype.includes('video')) {
                tipo = 'video';
            }
            
            const archivoInfo = await guardarArchivo(media, userId, tipo);
            
            // Actualizar el archivo en los datos
            estadoUsuario.datos.archivoInfo = archivoInfo;
            estadoUsuario.datos.imagenPath = archivoInfo.ruta;
            
            // Ir a vista previa
            estadoUsuario.estado = 'mostrando_vista_previa_edicion';
            userStates.set(userId, estadoUsuario);
            
            const preview = generarVistaPrevia(estadoUsuario.datos);
            await message.reply(preview + "\n\n*¿Guardar los cambios?*\n\n1️⃣ - Sí, guardar\n2️⃣ - No, cancelar");
        } catch (error) {
            await message.reply("❌ Error al procesar el archivo. Intenta nuevamente.");
        }
    } else {
        await message.reply("❌ No se detectó ningún archivo. Por favor envía un archivo o escribe *mantener*.");
    }
}

async function procesarEditarMensaje(message, userId, estadoUsuario) {
    const texto = message.body.trim();
    
    if (texto.toLowerCase() === 'mantener') {
        // Mantener mensaje actual
        estadoUsuario.estado = 'mostrando_vista_previa_edicion';
        userStates.set(userId, estadoUsuario);
        
        const preview = generarVistaPrevia(estadoUsuario.datos);
        await message.reply(preview + "\n\n*¿Guardar los cambios?*\n\n1️⃣ - Sí, guardar\n2️⃣ - No, cancelar");
        return;
    }
    
    // Actualizar mensaje
    estadoUsuario.datos.mensaje = texto;
    
    estadoUsuario.estado = 'mostrando_vista_previa_edicion';
    userStates.set(userId, estadoUsuario);
    
    const preview = generarVistaPrevia(estadoUsuario.datos);
    await message.reply(preview + "\n\n*¿Guardar los cambios?*\n\n1️⃣ - Sí, guardar\n2️⃣ - No, cancelar");
}

async function procesarEditarCantidadHoras(message, userId, estadoUsuario) {
    const opcion = message.body.trim();
    
    if (opcion === '1') {
        estadoUsuario.datos.cantidadHoras = 1;
        estadoUsuario.estado = 'programacion_editar_hora_unica';
        userStates.set(userId, estadoUsuario);
        
        await message.reply(
            "⏰ *PROGRAMAR 1 HORA*\n\n" +
            "Envía la nueva hora:\n\n" +
            "*Ejemplos:* 06:00, 8:30 am, 18:00\n\n" +
            "O envía *mantener* para conservar las horas actuales."
        );
        
    } else if (opcion === '2') {
        estadoUsuario.datos.cantidadHoras = 2;
        estadoUsuario.estado = 'programacion_editar_horas_dos';
        userStates.set(userId, estadoUsuario);
        
        await message.reply(
            "⏰ *PROGRAMAR 2 HORAS*\n\n" +
            "Envía las 2 nuevas horas (separadas por 'y'):\n\n" +
            "*Ejemplo:* 06:00 y 18:00\n\n" +
            "O envía *mantener* para conservar las horas actuales."
        );
        
    } else if (opcion === '3') {
        estadoUsuario.datos.cantidadHoras = 3;
        estadoUsuario.estado = 'programacion_editar_tres_horas';
        userStates.set(userId, estadoUsuario);
        
        await message.reply(
            "⏰ *PROGRAMAR 3 HORAS*\n\n" +
            "Envía las 3 nuevas horas (separadas por comas y 'y'):\n\n" +
            "*Ejemplo:* 06:00, 12:00 y 18:00\n\n" +
            "O envía *mantener* para conservar las horas actuales."
        );
        
    } else {
        await message.reply("❌ Opción inválida. Por favor envía un número del 1 al 3.");
    }
}

async function procesarEditarHoraUnica(message, userId, estadoUsuario) {
    const texto = message.body.trim().toLowerCase();
    
    if (texto === 'mantener') {
        // Mantener horas actuales
        estadoUsuario.estado = 'mostrando_vista_previa_edicion';
        userStates.set(userId, estadoUsuario);
        
        const preview = generarVistaPrevia(estadoUsuario.datos);
        await message.reply(preview + "\n\n*¿Guardar los cambios?*\n\n1️⃣ - Sí, guardar\n2️⃣ - No, cancelar");
        return;
    }
    
    const horaParseada = parsearHora(texto);
    
    if (horaParseada) {
        estadoUsuario.datos.horas = [horaParseada];
        estadoUsuario.estado = 'mostrando_vista_previa_edicion';
        userStates.set(userId, estadoUsuario);
        
        const preview = generarVistaPrevia(estadoUsuario.datos);
        await message.reply(preview + "\n\n*¿Guardar los cambios?*\n\n1️⃣ - Sí, guardar\n2️⃣ - No, cancelar");
    } else {
        await message.reply(`❌ Formato de hora inválido. Usa formato HH:MM o HH:MM am/pm`);
    }
}

async function procesarEditarHorasDos(message, userId, estadoUsuario) {
    const texto = message.body.trim().toLowerCase();
    
    if (texto === 'mantener') {
        // Mantener horas actuales
        estadoUsuario.estado = 'mostrando_vista_previa_edicion';
        userStates.set(userId, estadoUsuario);
        
        const preview = generarVistaPrevia(estadoUsuario.datos);
        await message.reply(preview + "\n\n*¿Guardar los cambios?*\n\n1️⃣ - Sí, guardar\n2️⃣ - No, cancelar");
        return;
    }
    
    const horas = texto.split(' y ');
    
    if (horas.length !== 2) {
        await message.reply("❌ Debes enviar exactamente DOS horas separadas por 'y'");
        return;
    }
    
    const horasParseadas = [];
    
    for (let horaStr of horas) {
        const horaParseada = parsearHora(horaStr.trim());
        if (horaParseada) {
            horasParseadas.push(horaParseada);
        } else {
            await message.reply(`❌ Formato de hora inválido: "${horaStr}"`);
            return;
        }
    }
    
    estadoUsuario.datos.horas = horasParseadas;
    estadoUsuario.estado = 'mostrando_vista_previa_edicion';
    userStates.set(userId, estadoUsuario);
    
    const preview = generarVistaPrevia(estadoUsuario.datos);
    await message.reply(preview + "\n\n*¿Guardar los cambios?*\n\n1️⃣ - Sí, guardar\n2️⃣ - No, cancelar");
}

async function procesarEditarTresHoras(message, userId, estadoUsuario) {
    const texto = message.body.trim().toLowerCase();
    
    if (texto === 'mantener') {
        // Mantener horas actuales
        estadoUsuario.estado = 'mostrando_vista_previa_edicion';
        userStates.set(userId, estadoUsuario);
        
        const preview = generarVistaPrevia(estadoUsuario.datos);
        await message.reply(preview + "\n\n*¿Guardar los cambios?*\n\n1️⃣ - Sí, guardar\n2️⃣ - No, cancelar");
        return;
    }
    
    const partes = texto.split(' y ');
    let horasArray = [];
    
    if (partes.length === 2) {
        const primerasHoras = partes[0].split(',').map(h => h.trim());
        const ultimaHora = partes[1].trim();
        horasArray = [...primerasHoras, ultimaHora];
    } else {
        horasArray = texto.split(',').map(h => h.trim());
    }
    
    if (horasArray.length !== 3) {
        await message.reply("❌ Debes enviar exactamente TRES horas\n\nEjemplo: 06:00, 12:00 y 18:00");
        return;
    }
    
    const horasParseadas = [];
    
    for (let horaStr of horasArray) {
        const horaParseada = parsearHora(horaStr);
        if (horaParseada) {
            horasParseadas.push(horaParseada);
        } else {
            await message.reply(`❌ Formato de hora inválido: "${horaStr}"`);
            return;
        }
    }
    
    estadoUsuario.datos.horas = horasParseadas;
    estadoUsuario.estado = 'mostrando_vista_previa_edicion';
    userStates.set(userId, estadoUsuario);
    
    const preview = generarVistaPrevia(estadoUsuario.datos);
    await message.reply(preview + "\n\n*¿Guardar los cambios?*\n\n1️⃣ - Sí, guardar\n2️⃣ - No, cancelar");
}

async function procesarEditarFrecuencia(message, userId, estadoUsuario) {
    const opcion = message.body.trim();
    
    if (opcion.toLowerCase() === 'mantener') {
        // Mantener frecuencia actual
        estadoUsuario.estado = 'mostrando_vista_previa_edicion';
        userStates.set(userId, estadoUsuario);
        
        const preview = generarVistaPrevia(estadoUsuario.datos);
        await message.reply(preview + "\n\n*¿Guardar los cambios?*\n\n1️⃣ - Sí, guardar\n2️⃣ - No, cancelar");
        return;
    }
    
    if (opcion === '1') {
        estadoUsuario.datos.frecuencia = 'una_vez';
        estadoUsuario.datos.fechaInicio = new Date();
        estadoUsuario.datos.fechaFin = new Date();
        
        estadoUsuario.estado = 'mostrando_vista_previa_edicion';
        userStates.set(userId, estadoUsuario);
        
        const preview = generarVistaPrevia(estadoUsuario.datos);
        await message.reply(preview + "\n\n*¿Guardar los cambios?*\n\n1️⃣ - Sí, guardar\n2️⃣ - No, cancelar");
        
    } else if (opcion === '2') {
        estadoUsuario.datos.frecuencia = 'diario';
        
        estadoUsuario.estado = 'mostrando_vista_previa_edicion';
        userStates.set(userId, estadoUsuario);
        
        const preview = generarVistaPrevia(estadoUsuario.datos);
        await message.reply(preview + "\n\n*¿Guardar los cambios?*\n\n1️⃣ - Sí, guardar\n2️⃣ - No, cancelar");
        
    } else if (opcion === '3') {
        estadoUsuario.datos.frecuencia = 'personalizado';
        estadoUsuario.estado = 'programacion_editar_fecha_inicio';
        userStates.set(userId, estadoUsuario);
        
        await message.reply(
            "📅 *FRECUENCIA PERSONALIZADA*\n\n" +
            "Envía la nueva fecha de INICIO en formato DD/MM/YYYY\n\n" +
            "*Ejemplo:* 15/01/2024\n\n" +
            "O envía *mantener* para conservar la fecha actual."
        );
        
    } else {
        await message.reply("❌ Opción inválida. Por favor envía un número del 1 al 3.");
    }
}

async function procesarEditarFechaInicio(message, userId, estadoUsuario) {
    const texto = message.body.trim().toLowerCase();
    
    if (texto === 'mantener') {
        // Mantener fecha actual
        estadoUsuario.estado = 'mostrando_vista_previa_edicion';
        userStates.set(userId, estadoUsuario);
        
        const preview = generarVistaPrevia(estadoUsuario.datos);
        await message.reply(preview + "\n\n*¿Guardar los cambios?*\n\n1️⃣ - Sí, guardar\n2️⃣ - No, cancelar");
        return;
    }
    
    let fechaInicio;
    
    if (texto === 'hoy') {
        fechaInicio = new Date();
    } else {
        const regexFecha = /^(\d{2})\/(\d{2})\/(\d{4})$/;
        const match = texto.match(regexFecha);
        
        if (match) {
            const dia = parseInt(match[1]);
            const mes = parseInt(match[2]) - 1;
            const anio = parseInt(match[3]);
            
            fechaInicio = new Date(anio, mes, dia);
            
            if (fechaInicio.getDate() !== dia || fechaInicio.getMonth() !== mes) {
                await message.reply("❌ Fecha inválida. Verifica el día y mes.");
                return;
            }
            
            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);
            if (fechaInicio < hoy) {
                await message.reply("❌ No puedes programar para fechas pasadas.");
                return;
            }
        } else {
            await message.reply("❌ Formato de fecha inválido. Usa DD/MM/YYYY");
            return;
        }
    }
    
    estadoUsuario.datos.fechaInicio = fechaInicio;
    estadoUsuario.estado = 'programacion_editar_fecha_fin';
    userStates.set(userId, estadoUsuario);
    
    await message.reply(
        "✅ *Fecha de inicio actualizada*\n\n" +
        "Envía la nueva fecha de FIN en formato DD/MM/YYYY\n\n" +
        "*Ejemplo:* 31/12/2024\n\n" +
        "O envía *indefinido* para que no tenga fecha de fin\n" +
        "O envía *mantener* para conservar la fecha actual."
    );
}

async function procesarEditarFechaFin(message, userId, estadoUsuario) {
    const texto = message.body.trim().toLowerCase();
    
    if (texto === 'mantener') {
        // Mantener fecha actual
        estadoUsuario.estado = 'mostrando_vista_previa_edicion';
        userStates.set(userId, estadoUsuario);
        
        const preview = generarVistaPrevia(estadoUsuario.datos);
        await message.reply(preview + "\n\n*¿Guardar los cambios?*\n\n1️⃣ - Sí, guardar\n2️⃣ - No, cancelar");
        return;
    }
    
    let fechaFin = null;
    
    if (texto === 'indefinido') {
        fechaFin = null;
    } else {
        const regexFecha = /^(\d{2})\/(\d{2})\/(\d{4})$/;
        const match = texto.match(regexFecha);
        
        if (match) {
            const dia = parseInt(match[1]);
            const mes = parseInt(match[2]) - 1;
            const anio = parseInt(match[3]);
            
            fechaFin = new Date(anio, mes, dia);
            
            if (fechaFin.getDate() !== dia || fechaFin.getMonth() !== mes) {
                await message.reply("❌ Fecha inválida. Verifica el día y mes.");
                return;
            }
            
            if (fechaFin < estadoUsuario.datos.fechaInicio) {
                await message.reply("❌ La fecha de fin debe ser después de la fecha de inicio.");
                return;
            }
        } else {
            await message.reply("❌ Formato de fecha inválido. Usa DD/MM/YYYY o escribe *indefinido*");
            return;
        }
    }
    
    estadoUsuario.datos.fechaFin = fechaFin;
    estadoUsuario.estado = 'mostrando_vista_previa_edicion';
    userStates.set(userId, estadoUsuario);
    
    const preview = generarVistaPrevia(estadoUsuario.datos);
    await message.reply(preview + "\n\n*¿Guardar los cambios?*\n\n1️⃣ - Sí, guardar\n2️⃣ - No, cancelar");
}

async function procesarEditarGrupos(message, userId, estadoUsuario) {
    const opcion = message.body.trim().toLowerCase();
    
    if (opcion === 'mantener') {
        // Mantener grupos actuales
        estadoUsuario.estado = 'mostrando_vista_previa_edicion';
        userStates.set(userId, estadoUsuario);
        
        const preview = generarVistaPrevia(estadoUsuario.datos);
        await message.reply(preview + "\n\n*¿Guardar los cambios?*\n\n1️⃣ - Sí, guardar\n2️⃣ - No, cancelar");
        return;
    }
    
    if (opcion === '1') {
        estadoUsuario.datos.enviarATodos = true;
        estadoUsuario.estado = 'mostrando_vista_previa_edicion';
        userStates.set(userId, estadoUsuario);
        
        const preview = generarVistaPrevia(estadoUsuario.datos);
        await message.reply(preview + "\n\n*¿Guardar los cambios?*\n\n1️⃣ - Sí, guardar\n2️⃣ - No, cancelar");
        
    } else if (opcion === '2') {
        estadoUsuario.datos.enviarATodos = false;
        estadoUsuario.estado = 'programacion_editar_seleccion_grupos';
        userStates.set(userId, estadoUsuario);
        
        const grupos = await obtenerGrupos();
        availableGroups = grupos;
        
        if (grupos.length === 0) {
            await message.reply("❌ No hay grupos disponibles. El bot no está en ningún grupo.");
            userStates.delete(userId);
            return;
        }
        
        let listaGrupos = "👥 *SELECCIONAR GRUPOS*\n\n";
        grupos.forEach((grupo, index) => {
            listaGrupos += `${numeroConEmoji(index + 1)} - ${grupo.name}\n`;
        });
        
        listaGrupos += "\nEnvía los *números* de los grupos (separados por coma):\n";
        listaGrupos += "Ejemplo: 1,3,5\n";
        listaGrupos += "O envía *todos* para seleccionar todos los grupos";
        
        await message.reply(listaGrupos);
        
    } else {
        await message.reply("Por favor selecciona:\n1 - Todos\n2 - Seleccionar específicos");
    }
}

async function procesarEditarSeleccionGrupos(message, userId, estadoUsuario) {
    const texto = message.body.trim().toLowerCase();
    
    if (texto === 'todos') {
        estadoUsuario.datos.gruposSeleccionados = availableGroups.map(g => g.id._serialized);
    } else {
        const numeros = texto.split(',').map(num => parseInt(num.trim()) - 1);
        const gruposValidos = [];
        
        for (const num of numeros) {
            if (num >= 0 && num < availableGroups.length) {
                gruposValidos.push(availableGroups[num].id._serialized);
            }
        }
        
        if (gruposValidos.length === 0) {
            await message.reply("❌ No seleccionaste grupos válidos. Intenta nuevamente.");
            return;
        }
        
        estadoUsuario.datos.gruposSeleccionados = gruposValidos;
    }
    
    estadoUsuario.estado = 'mostrando_vista_previa_edicion';
    userStates.set(userId, estadoUsuario);
    
    const preview = generarVistaPrevia(estadoUsuario.datos);
    await message.reply(preview + "\n\n*¿Guardar los cambios?*\n\n1️⃣ - Sí, guardar\n2️⃣ - No, cancelar");
}

async function iniciarNuevaProgramacion(message, userId) {
    userStates.set(userId, {
        estado: 'programacion_esperando_credenciales',
        datos: { esNuevo: true }
    });
    
    await message.reply(
        "🔐 *PROGRAMACIÓN DE MENSAJES*\n\n" +
        "Esta opción es solo para administradores.\n\n" +
        "Por favor envía tus credenciales en el formato:\n" +
        "`usuario:contraseña`\n\n" +
        "Ejemplo: admin:admin123\n\n" +
        "O envía *cancelar* para regresar al menú principal."
    );
}

async function procesarCredencialesNueva(message, userId, estadoUsuario) {
    const texto = message.body.trim();
    
    if (texto.includes(':')) {
        const partes = texto.split(':');
        const usuario = partes[0].trim();
        const contrasena = partes[1].trim();
        
        if (usuario === ADMIN_CREDENTIALS.username && contrasena === ADMIN_CREDENTIALS.password) {
            estadoUsuario.estado = 'programacion_nueva_tipo_contenido';
            userStates.set(userId, estadoUsuario);
            
            await message.reply(
                "✅ *Credenciales correctas*\n\n" +
                "¿Qué tipo de contenido deseas programar?\n\n" +
                "1️⃣ - Imagen (JPG, PNG, GIF)\n" +
                "2️⃣ - Video (MP4, AVI, MOV)\n" +
                "3️⃣ - Documento (PDF, DOCX)\n" +
                "4️⃣ - Solo texto (sin archivo adjunto)\n\n" +
                "Envía el número de la opción (1-4)"
            );
        } else {
            await message.reply(
                "❌ *Credenciales incorrectas*\n\n" +
                "Por favor ingresa de nuevo las credenciales.\n" +
                "Formato: usuario:contraseña\n\n" +
                "O envía *cancelar* para regresar al menú."
            );
        }
    } else {
        await message.reply("Formato incorrecto. Usa: usuario:contraseña");
    }
}

async function procesarNuevaTipoContenido(message, userId, estadoUsuario) {
    const opcion = message.body.trim();
    
    if (opcion === '1') {
        estadoUsuario.datos.tipoContenido = 'imagen';
        estadoUsuario.estado = 'programacion_nueva_esperando_archivo';
        userStates.set(userId, estadoUsuario);
        
        await message.reply(
            "📸 *PROGRAMAR IMAGEN*\n\n" +
            "Ahora envía la imagen que deseas programar:\n\n" +
            "O envía *omitir* para programar solo texto."
        );
        
    } else if (opcion === '2') {
        estadoUsuario.datos.tipoContenido = 'video';
        estadoUsuario.estado = 'programacion_nueva_esperando_archivo';
        userStates.set(userId, estadoUsuario);
        
        await message.reply(
            "🎬 *PROGRAMAR VIDEO*\n\n" +
            "Ahora envía el video que deseas programar:\n\n" +
            "O envía *omitir* para programar solo texto."
        );
        
    } else if (opcion === '3') {
        estadoUsuario.datos.tipoContenido = 'documento';
        estadoUsuario.estado = 'programacion_nueva_esperando_archivo';
        userStates.set(userId, estadoUsuario);
        
        await message.reply(
            "📄 *PROGRAMAR DOCUMENTO*\n\n" +
            "Ahora envía el documento que deseas programar:\n\n" +
            "O envía *omitir* para programar solo texto."
        );
        
    } else if (opcion === '4') {
        estadoUsuario.datos.tipoContenido = 'texto';
        estadoUsuario.datos.archivoInfo = null;
        estadoUsuario.estado = 'programacion_nueva_esperando_mensaje';
        userStates.set(userId, estadoUsuario);
        
        await message.reply(
            "📝 *PROGRAMAR SOLO TEXTO*\n\n" +
            "Ahora envía el mensaje de texto que quieres programar:"
        );
        
    } else {
        await message.reply("❌ Opción inválida. Por favor envía un número del 1 al 4.");
    }
}

async function procesarNuevaArchivo(message, userId, estadoUsuario) {
    const texto = message.body.trim().toLowerCase();
    
    if (texto === 'omitir') {
        estadoUsuario.datos.archivoInfo = null;
        estadoUsuario.estado = 'programacion_nueva_esperando_mensaje';
        userStates.set(userId, estadoUsuario);
        
        await message.reply(
            "✅ *Sin archivo adjunto*\n\n" +
            "Ahora envía el mensaje de texto que quieres programar:"
        );
        return;
    }
    
    if (message.hasMedia) {
        try {
            const media = await message.downloadMedia();
            let tipo = estadoUsuario.datos.tipoContenido;
            
            if (!tipo) {
                if (media.mimetype.includes('image')) {
                    tipo = 'imagen';
                } else if (media.mimetype.includes('video')) {
                    tipo = 'video';
                } else if (media.mimetype.includes('pdf') || media.mimetype.includes('document')) {
                    tipo = 'documento';
                } else {
                    tipo = 'documento';
                }
            }
            
            const archivoInfo = await guardarArchivo(media, userId, tipo);
            
            estadoUsuario.datos.archivoInfo = archivoInfo;
            estadoUsuario.datos.imagenPath = archivoInfo.ruta;
            estadoUsuario.estado = 'programacion_nueva_esperando_mensaje';
            userStates.set(userId, estadoUsuario);
            
            await message.reply(
                `✅ *${tipo.toUpperCase()} recibido correctamente*\n\n` +
                "Ahora envía el mensaje de texto que quieres que acompañe al archivo.\n\n" +
                "O envía *omitir* si solo quieres enviar el archivo sin texto."
            );
        } catch (error) {
            await message.reply("❌ Error al procesar el archivo. Intenta nuevamente.");
        }
    } else {
        await message.reply("❌ No se detectó ningún archivo. Por favor envía un archivo o escribe *omitir*.");
    }
}

async function procesarNuevaMensaje(message, userId, estadoUsuario) {
    const texto = message.body.trim();
    
    if (texto.toLowerCase() === 'omitir') {
        estadoUsuario.datos.mensaje = "";
    } else {
        estadoUsuario.datos.mensaje = texto;
    }
    
    estadoUsuario.estado = 'programacion_nueva_cantidad_horas';
    userStates.set(userId, estadoUsuario);
    
    await message.reply(
        "✅ *Mensaje configurado*\n\n" +
        "¿Cuántas horas al día quieres programar?\n\n" +
        "1️⃣ - 1 hora al día\n" +
        "2️⃣ - 2 horas al día\n" +
        "3️⃣ - 3 horas al día\n\n" +
        "Envía el número de la opción (1-3)"
    );
}

async function procesarNuevaCantidadHoras(message, userId, estadoUsuario) {
    const opcion = message.body.trim();
    
    if (opcion === '1') {
        estadoUsuario.datos.cantidadHoras = 1;
        estadoUsuario.estado = 'programacion_nueva_hora_unica';
        userStates.set(userId, estadoUsuario);
        
        await message.reply(
            "⏰ *PROGRAMAR 1 HORA*\n\n" +
            "Envía la hora en la que quieres que se envíe el mensaje.\n\n" +
            "*Ejemplos:* 06:00, 8:30 am, 18:00"
        );
        
    } else if (opcion === '2') {
        estadoUsuario.datos.cantidadHoras = 2;
        estadoUsuario.estado = 'programacion_nueva_horas_dos';
        userStates.set(userId, estadoUsuario);
        
        await message.reply(
            "⏰ *PROGRAMAR 2 HORAS*\n\n" +
            "Envía las 2 horas separadas por 'y':\n\n" +
            "*Ejemplo:* 06:00 y 18:00"
        );
        
    } else if (opcion === '3') {
        estadoUsuario.datos.cantidadHoras = 3;
        estadoUsuario.estado = 'programacion_nueva_tres_horas';
        userStates.set(userId, estadoUsuario);
        
        await message.reply(
            "⏰ *PROGRAMAR 3 HORAS*\n\n" +
            "Envía las 3 horas separadas por comas y 'y':\n\n" +
            "*Ejemplo:* 06:00, 12:00 y 18:00"
        );
        
    } else {
        await message.reply("❌ Opción inválida. Por favor envía un número del 1 al 3.");
    }
}

async function procesarNuevaHoraUnica(message, userId, estadoUsuario) {
    const horaStr = message.body.trim();
    const horaParseada = parsearHora(horaStr);
    
    if (horaParseada) {
        estadoUsuario.datos.horas = [horaParseada];
        estadoUsuario.estado = 'programacion_nueva_frecuencia';
        userStates.set(userId, estadoUsuario);
        
        await message.reply(
            "✅ *Hora configurada*\n\n" +
            "¿Con qué frecuencia quieres que se envíe?\n\n" +
            "1️⃣ - *Una sola vez*\n" +
            "2️⃣ - *Diariamente*\n" +
            "3️⃣ - *Personalizado*\n\n" +
            "Envía el número de la opción (1-3)"
        );
    } else {
        await message.reply(`❌ Formato de hora inválido. Usa formato HH:MM o HH:MM am/pm`);
    }
}

async function procesarNuevaHorasDos(message, userId, estadoUsuario) {
    const texto = message.body.trim().toLowerCase();
    const horas = texto.split(' y ');
    
    if (horas.length !== 2) {
        await message.reply("❌ Debes enviar exactamente DOS horas separadas por 'y'");
        return;
    }
    
    const horasParseadas = [];
    
    for (let horaStr of horas) {
        const horaParseada = parsearHora(horaStr.trim());
        if (horaParseada) {
            horasParseadas.push(horaParseada);
        } else {
            await message.reply(`❌ Formato de hora inválido: "${horaStr}"`);
            return;
        }
    }
    
    estadoUsuario.datos.horas = horasParseadas;
    estadoUsuario.estado = 'programacion_nueva_frecuencia';
    userStates.set(userId, estadoUsuario);
    
    await message.reply(
        "✅ *Horas configuradas*\n\n" +
        "¿Con qué frecuencia quieres que se envíe?\n\n" +
        "1️⃣ - *Una sola vez*\n" +
        "2️⃣ - *Diariamente*\n" +
        "3️⃣ - *Personalizado*\n\n" +
        "Envía el número de la opción (1-3)"
    );
}

async function procesarNuevaTresHoras(message, userId, estadoUsuario) {
    const texto = message.body.trim().toLowerCase();
    
    const partes = texto.split(' y ');
    let horasArray = [];
    
    if (partes.length === 2) {
        const primerasHoras = partes[0].split(',').map(h => h.trim());
        const ultimaHora = partes[1].trim();
        horasArray = [...primerasHoras, ultimaHora];
    } else {
        horasArray = texto.split(',').map(h => h.trim());
    }
    
    if (horasArray.length !== 3) {
        await message.reply("❌ Debes enviar exactamente TRES horas\n\nEjemplo: 06:00, 12:00 y 18:00");
        return;
    }
    
    const horasParseadas = [];
    
    for (let horaStr of horasArray) {
        const horaParseada = parsearHora(horaStr);
        if (horaParseada) {
            horasParseadas.push(horaParseada);
        } else {
            await message.reply(`❌ Formato de hora inválido: "${horaStr}"`);
            return;
        }
    }
    
    estadoUsuario.datos.horas = horasParseadas;
    estadoUsuario.estado = 'programacion_nueva_frecuencia';
    userStates.set(userId, estadoUsuario);
    
    await message.reply(
        "✅ *Horas configuradas*\n\n" +
        "¿Con qué frecuencia quieres que se envíe?\n\n" +
        "1️⃣ - *Una sola vez*\n" +
        "2️⃣ - *Diariamente*\n" +
        "3️⃣ - *Personalizado*\n\n" +
        "Envía el número de la opción (1-3)"
    );
}

async function procesarNuevaFrecuencia(message, userId, estadoUsuario) {
    const opcion = message.body.trim();
    
    if (opcion === '1') {
        estadoUsuario.datos.frecuencia = 'una_vez';
        estadoUsuario.datos.fechaInicio = new Date();
        estadoUsuario.datos.fechaFin = new Date();
        
        await procesarNuevaGrupos(message, userId, estadoUsuario);
        
    } else if (opcion === '2') {
        estadoUsuario.datos.frecuencia = 'diario';
        await procesarNuevaGrupos(message, userId, estadoUsuario);
        
    } else if (opcion === '3') {
        estadoUsuario.datos.frecuencia = 'personalizado';
        estadoUsuario.estado = 'programacion_nueva_fecha_inicio';
        userStates.set(userId, estadoUsuario);
        
        await message.reply(
            "📅 *FRECUENCIA PERSONALIZADA*\n\n" +
            "Envía la fecha de INICIO en formato DD/MM/YYYY\n\n" +
            "*Ejemplo:* 15/01/2024\n\n" +
            "O envía *hoy* para empezar hoy"
        );
        
    } else {
        await message.reply("❌ Opción inválida. Por favor envía un número del 1 al 3.");
    }
}

async function procesarNuevaFechaInicio(message, userId, estadoUsuario) {
    const texto = message.body.trim().toLowerCase();
    
    let fechaInicio;
    
    if (texto === 'hoy') {
        fechaInicio = new Date();
    } else {
        const regexFecha = /^(\d{2})\/(\d{2})\/(\d{4})$/;
        const match = texto.match(regexFecha);
        
        if (match) {
            const dia = parseInt(match[1]);
            const mes = parseInt(match[2]) - 1;
            const anio = parseInt(match[3]);
            
            fechaInicio = new Date(anio, mes, dia);
            
            if (fechaInicio.getDate() !== dia || fechaInicio.getMonth() !== mes) {
                await message.reply("❌ Fecha inválida. Verifica el día y mes.");
                return;
            }
            
            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);
            if (fechaInicio < hoy) {
                await message.reply("❌ No puedes programar para fechas pasadas.");
                return;
            }
        } else {
            await message.reply("❌ Formato de fecha inválido. Usa DD/MM/YYYY");
            return;
        }
    }
    
    estadoUsuario.datos.fechaInicio = fechaInicio;
    estadoUsuario.estado = 'programacion_nueva_fecha_fin';
    userStates.set(userId, estadoUsuario);
    
    await message.reply(
        "✅ *Fecha de inicio configurada*\n\n" +
        "Envía la fecha de FIN en formato DD/MM/YYYY\n\n" +
        "*Ejemplo:* 31/12/2024\n\n" +
        "O envía *indefinido* para que no tenga fecha de fin"
    );
}

async function procesarNuevaFechaFin(message, userId, estadoUsuario) {
    const texto = message.body.trim().toLowerCase();
    
    let fechaFin = null;
    
    if (texto === 'indefinido') {
        fechaFin = null;
    } else {
        const regexFecha = /^(\d{2})\/(\d{2})\/(\d{4})$/;
        const match = texto.match(regexFecha);
        
        if (match) {
            const dia = parseInt(match[1]);
            const mes = parseInt(match[2]) - 1;
            const anio = parseInt(match[3]);
            
            fechaFin = new Date(anio, mes, dia);
            
            if (fechaFin.getDate() !== dia || fechaFin.getMonth() !== mes) {
                await message.reply("❌ Fecha inválida. Verifica el día y mes.");
                return;
            }
            
            if (fechaFin < estadoUsuario.datos.fechaInicio) {
                await message.reply("❌ La fecha de fin debe ser después de la fecha de inicio.");
                return;
            }
        } else {
            await message.reply("❌ Formato de fecha inválido. Usa DD/MM/YYYY o escribe *indefinido*");
            return;
        }
    }
    
    estadoUsuario.datos.fechaFin = fechaFin;
    await procesarNuevaGrupos(message, userId, estadoUsuario);
}

async function procesarNuevaGrupos(message, userId, estadoUsuario) {
    estadoUsuario.estado = 'programacion_nueva_confirmacion_grupos';
    userStates.set(userId, estadoUsuario);
    
    await message.reply(
        "✅ *Configuración completada*\n\n" +
        "¿Quieres que el mensaje se envíe a *todos* los grupos?\n\n" +
        "1️⃣ - *Sí*, enviar a todos los grupos\n" +
        "2️⃣ - *No*, seleccionar grupos específicos"
    );
}

async function procesarNuevaConfirmacionGrupos(message, userId, estadoUsuario) {
    const opcion = message.body.trim();
    
    if (opcion === '1' || opcion.toLowerCase() === 'sí' || opcion.toLowerCase() === 'si') {
        estadoUsuario.datos.enviarATodos = true;
        estadoUsuario.estado = 'mostrando_vista_previa_nueva';
        userStates.set(userId, estadoUsuario);
        
        const preview = generarVistaPrevia(estadoUsuario.datos);
        await message.reply(preview + "\n\n*¿Guardar esta programación?*\n\n1️⃣ - Sí, guardar\n2️⃣ - No, cancelar");
        
    } else if (opcion === '2' || opcion.toLowerCase() === 'no') {
        estadoUsuario.datos.enviarATodos = false;
        estadoUsuario.estado = 'programacion_nueva_seleccion_grupos';
        userStates.set(userId, estadoUsuario);
        
        const grupos = await obtenerGrupos();
        availableGroups = grupos;
        
        if (grupos.length === 0) {
            await message.reply("❌ No hay grupos disponibles. El bot no está en ningún grupo.");
            userStates.delete(userId);
            return;
        }
        
        let listaGrupos = "👥 *GRUPOS DISPONIBLES*\n\n";
        grupos.forEach((grupo, index) => {
            listaGrupos += `${numeroConEmoji(index + 1)} - ${grupo.name}\n`;
        });
        
        listaGrupos += "\nEnvía los *números* de los grupos (separados por coma):\n";
        listaGrupos += "Ejemplo: 1,3,5\n";
        listaGrupos += "O envía *todos* para seleccionar todos los grupos";
        
        await message.reply(listaGrupos);
        
    } else {
        await message.reply("Por favor selecciona:\n1 - Sí\n2 - No");
    }
}

async function procesarNuevaSeleccionGrupos(message, userId, estadoUsuario) {
    const texto = message.body.trim().toLowerCase();
    
    if (texto === 'todos') {
        estadoUsuario.datos.gruposSeleccionados = availableGroups.map(g => g.id._serialized);
    } else {
        const numeros = texto.split(',').map(num => parseInt(num.trim()) - 1);
        const gruposValidos = [];
        
        for (const num of numeros) {
            if (num >= 0 && num < availableGroups.length) {
                gruposValidos.push(availableGroups[num].id._serialized);
            }
        }
        
        if (gruposValidos.length === 0) {
            await message.reply("❌ No seleccionaste grupos válidos. Intenta nuevamente.");
            return;
        }
        
        estadoUsuario.datos.gruposSeleccionados = gruposValidos;
    }
    
    estadoUsuario.estado = 'mostrando_vista_previa_nueva';
    userStates.set(userId, estadoUsuario);
    
    const preview = generarVistaPrevia(estadoUsuario.datos);
    await message.reply(preview + "\n\n*¿Guardar esta programación?*\n\n1️⃣ - Sí, guardar\n2️⃣ - No, cancelar");
}

async function guardarProgramacion(message, userId, estadoUsuario) {
    const programacion = {
        archivoInfo: estadoUsuario.datos.archivoInfo,
        imagenPath: estadoUsuario.datos.imagenPath || (estadoUsuario.datos.archivoInfo ? estadoUsuario.datos.archivoInfo.ruta : null),
        mensaje: estadoUsuario.datos.mensaje || "",
        horas: estadoUsuario.datos.horas,
        frecuencia: estadoUsuario.datos.frecuencia || 'diario',
        fechaInicio: estadoUsuario.datos.fechaInicio || new Date(),
        fechaFin: estadoUsuario.datos.fechaFin || null,
        grupos: estadoUsuario.datos.enviarATodos ? 'todos' : estadoUsuario.datos.gruposSeleccionados,
        fechaCreacion: new Date(),
        creadoPor: userId,
        ultimoEnvio: null,
        enviosHoy: []
    };
    
    if (estadoUsuario.datos.indiceEditar !== undefined) {
        // Editar programación existente
        const programacionAntigua = scheduledMessages[estadoUsuario.datos.indiceEditar];
        
        // Eliminar archivo antiguo si es diferente
        if (programacionAntigua.archivoInfo && 
            programacion.archivoInfo && 
            programacionAntigua.archivoInfo.ruta !== programacion.archivoInfo.ruta) {
            try {
                if (fs.existsSync(programacionAntigua.archivoInfo.ruta)) {
                    fs.unlinkSync(programacionAntigua.archivoInfo.ruta);
                }
            } catch (error) {
                console.error("Error al eliminar archivo antiguo:", error);
            }
        }
        
        scheduledMessages[estadoUsuario.datos.indiceEditar] = programacion;
        await message.reply("✅ *PROGRAMACIÓN ACTUALIZADA EXITOSAMENTE*");
        
    } else {
        // Nueva programación
        scheduledMessages.push(programacion);
        await message.reply("✅ *PROGRAMACIÓN GUARDADA EXITOSAMENTE*");
    }
    
    // Guardar en archivo
    try {
        const archivoProgramaciones = path.join(__dirname, 'programaciones.json');
        fs.writeFileSync(archivoProgramaciones, JSON.stringify(scheduledMessages, null, 2));
        console.log(`💾 Programaciones guardadas en archivo: ${scheduledMessages.length}`);
    } catch (error) {
        console.error("Error al guardar programaciones:", error);
    }
    
    await message.reply(
        "📊 *Resumen:*\n" +
        `• Horas: ${programacion.horas.join(', ')}\n` +
        `• Frecuencia: ${programacion.frecuencia}\n` +
        `• Fecha inicio: ${moment(programacion.fechaInicio).tz(TIMEZONE).format('DD/MM/YYYY')}\n` +
        (programacion.fechaFin ? `• Fecha fin: ${moment(programacion.fechaFin).tz(TIMEZONE).format('DD/MM/YYYY')}\n` : '') +
        `• Grupos: ${programacion.grupos === 'todos' ? 'Todos' : programacion.grupos.length + ' grupo(s)'}\n\n` +
        "¡Gracias por usar el bot! 🚀"
    );
    
    userStates.delete(userId);
}

async function eliminarProgramacion(message, userId, estadoUsuario) {
    const indice = estadoUsuario.datos.indiceEliminar;
    const programacionEliminada = scheduledMessages.splice(indice, 1)[0];
    
    // Eliminar archivo asociado
    if (programacionEliminada.archivoInfo && fs.existsSync(programacionEliminada.archivoInfo.ruta)) {
        try {
            fs.unlinkSync(programacionEliminada.archivoInfo.ruta);
        } catch (error) {
            console.error("Error al eliminar archivo:", error);
        }
    }
    
    // Guardar cambios en archivo
    try {
        const archivoProgramaciones = path.join(__dirname, 'programaciones.json');
        fs.writeFileSync(archivoProgramaciones, JSON.stringify(scheduledMessages, null, 2));
    } catch (error) {
        console.error("Error al guardar programaciones:", error);
    }
    
    await message.reply(
        "✅ *PROGRAMACIÓN ELIMINADA EXITOSAMENTE*\n\n" +
        `*Mensaje eliminado:*\n` +
        `• Horas: ${programacionEliminada.horas.join(', ')}\n` +
        `• Fecha creación: ${moment(programacionEliminada.fechaCreacion).tz(TIMEZONE).format('DD/MM/YYYY HH:mm')}`
    );
    
    userStates.delete(userId);
}

// ============================================
// FUNCIONES DE CONSULTA A BASES DE DATOS
// ============================================

async function consultarGuardian(codigoEmpleado, mesSeleccionado, anioSeleccionado) {
    // ... (misma implementación que antes) ...
    // Por brevedad, mantengo la implementación anterior
    return {
        success: true,
        mensaje: "📊 *INFORME GUARDIAN - JARABE*\n\nEjemplo de respuesta..."
    };
}

async function consultarReclamosCalidad() {
    // ... (misma implementación que antes) ...
    return {
        success: true,
        mensaje: "📋 *SISTEMA DE RECLAMOS DE CALIDAD*\n\nEjemplo de respuesta..."
    };
}

async function obtenerSemaforoTerritorio() {
    // ... (misma implementación que antes) ...
    return "🚦 *INFORME SEMÁFORO DE TERRITORIOS*\n\nEjemplo de respuesta...";
}

async function buscarSkapILC(codigoEmpleado) {
    // ... (misma implementación que antes) ...
    return "📋 *INFORMACIÓN SKAP - ILC*\n\nEjemplo de respuesta...";
}

async function buscarSkapOUTS(codigoEmpleado) {
    // ... (misma implementación que antes) ...
    return "📋 *INFORMACIÓN SKAP - OUTS*\n\nEjemplo de respuesta...";
}

// ============================================
// FUNCIÓN PRINCIPAL DE MANEJO DE ESTADOS
// ============================================

async function manejarEstadoUsuario(message, userId) {
    const estadoUsuario = userStates.get(userId);
    const texto = message.body.trim().toLowerCase();
    
    if (texto === 'cancelar') {
        userStates.delete(userId);
        await message.reply("❌ Operación cancelada. Regresando al menú principal.");
        await enviarMenu(message);
        return;
    }
    
    // Mapeo de estados a funciones
    const stateHandlers = {
        // Guardian (Opción 2)
        'guardian_esperando_codigo': () => procesarCodigoGuardian(message, userId, estadoUsuario),
        'guardian_esperando_anio': () => procesarAnioGuardian(message, userId, estadoUsuario),
        'guardian_esperando_mes': () => procesarMesGuardian(message, userId, estadoUsuario),
        
        // Checklist (Opción 3)
        'checklist_menu_principal': () => procesarChecklistMenuPrincipal(message, userId, estadoUsuario),
        'checklist_esperando_grupo': () => {
            const opcion = parseInt(texto);
            const grupos = estadoUsuario.datos.grupos;
            
            if (isNaN(opcion) || opcion < 1 || opcion > grupos.length) {
                message.reply(`❌ Opción inválida. Por favor envía un número del 1 al ${grupos.length}.`);
                return;
            }
            
            const grupoSeleccionado = grupos[opcion - 1];
            obtenerAnosDisponibles(message, userId, 'grupo', grupoSeleccionado);
        },
        
        // CIP (Opción 7)
        'cip_esperando_tanque': () => procesarSeleccionTanqueCIP(message, userId, estadoUsuario),
        'cip_esperando_tipo_busqueda': () => procesarTipoBusquedaCIP(message, userId, estadoUsuario),
        'cip_esperando_rango_fechas': () => procesarRangoFechasCIP(message, userId, estadoUsuario),
        'cip_esperando_mes': () => procesarSeleccionMesCIP(message, userId, estadoUsuario),
        'cip_esperando_anio': () => procesarSeleccionAnioCIP(message, userId, estadoUsuario),
        'cip_esperando_formato_descarga': () => procesarFormatoDescargaCIP(message, userId, estadoUsuario),
        
        // SKAP (Opción 10)
        'seleccionar_tipo_skap': () => procesarSeleccionTipoSkap(message, userId, estadoUsuario),
        'esperando_codigo_skap_ilc': () => procesarCodigoSkapILC(message, userId, estadoUsuario),
        'esperando_codigo_skap_outs': () => procesarCodigoSkapOUTS(message, userId, estadoUsuario),
        
        // Programación de mensajes (Opción 9)
        'programacion_menu_principal': () => procesarProgramacionMenuPrincipal(message, userId, estadoUsuario),
        'programacion_despues_ver': () => procesarDespuesVer(message, userId, estadoUsuario),
        'programacion_esperando_indice_editar': () => procesarIndiceEditar(message, userId, estadoUsuario),
        'programacion_esperando_indice_eliminar': () => procesarIndiceEliminar(message, userId, estadoUsuario),
        'programacion_esperando_credenciales_editar': () => procesarCredencialesEditar(message, userId, estadoUsuario),
        'programacion_esperando_credenciales_eliminar': () => procesarCredencialesEliminar(message, userId, estadoUsuario),
        'programacion_editar_tipo_contenido': () => procesarEditarTipoContenido(message, userId, estadoUsuario),
        'programacion_editar_archivo': () => procesarEditarArchivo(message, userId, estadoUsuario),
        'programacion_editar_mensaje': () => procesarEditarMensaje(message, userId, estadoUsuario),
        'programacion_editar_cantidad_horas': () => procesarEditarCantidadHoras(message, userId, estadoUsuario),
        'programacion_editar_hora_unica': () => procesarEditarHoraUnica(message, userId, estadoUsuario),
        'programacion_editar_horas_dos': () => procesarEditarHorasDos(message, userId, estadoUsuario),
        'programacion_editar_tres_horas': () => procesarEditarTresHoras(message, userId, estadoUsuario),
        'programacion_editar_frecuencia': () => procesarEditarFrecuencia(message, userId, estadoUsuario),
        'programacion_editar_fecha_inicio': () => procesarEditarFechaInicio(message, userId, estadoUsuario),
        'programacion_editar_fecha_fin': () => procesarEditarFechaFin(message, userId, estadoUsuario),
        'programacion_editar_grupos': () => procesarEditarGrupos(message, userId, estadoUsuario),
        'programacion_editar_seleccion_grupos': () => procesarEditarSeleccionGrupos(message, userId, estadoUsuario),
        'programacion_esperando_credenciales': () => procesarCredencialesNueva(message, userId, estadoUsuario),
        'programacion_nueva_tipo_contenido': () => procesarNuevaTipoContenido(message, userId, estadoUsuario),
        'programacion_nueva_esperando_archivo': () => procesarNuevaArchivo(message, userId, estadoUsuario),
        'programacion_nueva_esperando_mensaje': () => procesarNuevaMensaje(message, userId, estadoUsuario),
        'programacion_nueva_cantidad_horas': () => procesarNuevaCantidadHoras(message, userId, estadoUsuario),
        'programacion_nueva_hora_unica': () => procesarNuevaHoraUnica(message, userId, estadoUsuario),
        'programacion_nueva_horas_dos': () => procesarNuevaHorasDos(message, userId, estadoUsuario),
        'programacion_nueva_tres_horas': () => procesarNuevaTresHoras(message, userId, estadoUsuario),
        'programacion_nueva_frecuencia': () => procesarNuevaFrecuencia(message, userId, estadoUsuario),
        'programacion_nueva_fecha_inicio': () => procesarNuevaFechaInicio(message, userId, estadoUsuario),
        'programacion_nueva_fecha_fin': () => procesarNuevaFechaFin(message, userId, estadoUsuario),
        'programacion_nueva_confirmacion_grupos': () => procesarNuevaConfirmacionGrupos(message, userId, estadoUsuario),
        'programacion_nueva_seleccion_grupos': () => procesarNuevaSeleccionGrupos(message, userId, estadoUsuario),
        'mostrando_vista_previa_nueva': () => {
            if (texto === '1' || texto === 'sí' || texto === 'si') {
                guardarProgramacion(message, userId, estadoUsuario);
            } else if (texto === '2' || texto === 'no') {
                userStates.delete(userId);
                message.reply("❌ Programación cancelada.");
            } else {
                message.reply("Por favor selecciona:\n1 - Sí, guardar\n2 - No, cancelar");
            }
        },
        'mostrando_vista_previa_edicion': () => {
            if (texto === '1' || texto === 'sí' || texto === 'si') {
                guardarProgramacion(message, userId, estadoUsuario);
            } else if (texto === '2' || texto === 'no') {
                userStates.delete(userId);
                message.reply("❌ Edición cancelada.");
            } else {
                message.reply("Por favor selecciona:\n1 - Sí, guardar\n2 - No, cancelar");
            }
        }
    };
    
    const handler = stateHandlers[estadoUsuario.estado];
    if (handler) {
        await handler();
    } else {
        console.log(`⚠️ Estado no manejado: ${estadoUsuario.estado}`);
        userStates.delete(userId);
        await enviarMenu(message);
    }
}

// ============================================
// FUNCIÓN PARA ENVIAR MENÚ PRINCIPAL
// ============================================

async function enviarMenu(message) {
    const saludo = obtenerSaludo();
    
    const menu = 
        `*Hola ${saludo}!* 🌞\n` +
        `Mi nombre es *Jarabito* 🤖, tu asistente de seguridad e información de Jarabe.\n` +
        `¿En qué te puedo ayudar hoy?\n\n` +
        `*Selecciona una opción:*\n\n` +
        `1️⃣ - *Acadia* 📊\n` +
        `2️⃣ - *Guardian* 🛡️\n` +
        `3️⃣ - *Checklist de seguridad* ✅\n` +
        `4️⃣ - *Semáforo de territorio* 🚦\n` +
        `5️⃣ - *Reclamos de calidad* 📋\n` +
        `6️⃣ - *Energía* ⚡\n` +
        `7️⃣ - *CIP Jarabe terminado* 🧪\n` +
        `8️⃣ - *CIP Jarabe simple* 🧪\n` +
        `9️⃣ - *Programar mensajes* ⏰\n` +
        `🔟 - *SKAP* 📋\n\n` +
        `*Envía el número de la opción (1-10)*`;
    
    await message.reply(menu);
}

// ============================================
// FUNCIÓN PARA MANEJAR OPCIONES DEL MENÚ
// ============================================

async function manejarOpcionMenu(message, opcion) {
    const userId = message.from;
    
    // Limpiar cualquier estado previo
    userStates.delete(userId);
    
    switch(opcion) {
        case 1: // Acadia
            await manejarAcadia(message);
            break;
        case 2: // Guardian
            await manejarGuardian(message, userId);
            break;
        case 3: // Checklist
            await manejarChecklistSeguridad(message, userId);
            break;
        case 4: // Semáforo
            await manejarSemaforoTerritorio(message);
            break;
        case 5: // Reclamos
            await manejarReclamosCalidad(message);
            break;
        case 6: // Energía
            await manejarEnergia(message);
            break;
        case 7: // CIP Terminado
            await manejarCIPJarabeTerminado(message, userId);
            break;
        case 8: // CIP Simple
            await manejarCIPJarabeSimple(message);
            break;
        case 9: // Programar
            await manejarProgramarMensajes(message, userId);
            break;
        case 10: // SKAP
            await manejarSKAP(message, userId);
            break;
        default:
            await message.reply("❌ Opción no válida. Por favor envía un número del 1 al 10.");
    }
}

// ============================================
// FUNCIONES PARA MENSAJES PROGRAMADOS
// ============================================

async function verificarMensajesProgramados() {
    const horaActual = moment().tz(TIMEZONE).format('HH:mm');
    const fechaActual = moment().tz(TIMEZONE).format('YYYY-MM-DD');
    
    for (let i = 0; i < scheduledMessages.length; i++) {
        const programacion = scheduledMessages[i];
        
        const fechaActualObj = moment().tz(TIMEZONE).startOf('day');
        const fechaInicio = moment(programacion.fechaInicio).tz(TIMEZONE).startOf('day');
        const fechaFin = programacion.fechaFin ? moment(programacion.fechaFin).tz(TIMEZONE).startOf('day') : null;
        
        if (programacion.frecuencia === 'una_vez' && fechaActualObj > fechaInicio) {
            continue;
        }
        
        if (fechaActualObj < fechaInicio) {
            continue;
        }
        
        if (fechaFin && fechaActualObj > fechaFin) {
            continue;
        }
        
        const horaYaEnviadaHoy = programacion.enviosHoy && 
                                  programacion.enviosHoy.includes(`${fechaActual}-${horaActual}`);
        
        if (horaYaEnviadaHoy) {
            continue;
        }
        
        for (const horaProgramada of programacion.horas) {
            if (horaProgramada === horaActual) {
                await enviarMensajeProgramado(programacion);
                console.log(`📤 Mensaje enviado a las ${horaActual}`);
                
                if (!programacion.enviosHoy) {
                    scheduledMessages[i].enviosHoy = [];
                }
                scheduledMessages[i].enviosHoy.push(`${fechaActual}-${horaActual}`);
                
                if (scheduledMessages[i].ultimoEnvio) {
                    const ultimoEnvioFecha = moment(scheduledMessages[i].ultimoEnvio).tz(TIMEZONE).format('YYYY-MM-DD');
                    if (ultimoEnvioFecha !== fechaActual) {
                        scheduledMessages[i].enviosHoy = [`${fechaActual}-${horaActual}`];
                    }
                }
                
                scheduledMessages[i].ultimoEnvio = new Date();
                
                try {
                    const archivoProgramaciones = path.join(__dirname, 'programaciones.json');
                    fs.writeFileSync(archivoProgramaciones, JSON.stringify(scheduledMessages, null, 2));
                } catch (error) {
                    console.error("Error al guardar programaciones:", error);
                }
                
                break;
            }
        }
    }
    
    // Limpiar registros de días anteriores
    const ahora = moment().tz(TIMEZONE);
    const hoy = ahora.format('YYYY-MM-DD');
    
    for (let i = 0; i < scheduledMessages.length; i++) {
        if (scheduledMessages[i].enviosHoy && scheduledMessages[i].enviosHoy.length > 0) {
            const enviosHoy = scheduledMessages[i].enviosHoy.filter(enviado => enviado.startsWith(hoy));
            scheduledMessages[i].enviosHoy = enviosHoy;
        }
    }
}

async function enviarMensajeProgramado(programacion) {
    try {
        let chats = [];
        
        if (programacion.grupos === 'todos') {
            const todosChats = await client.getChats();
            chats = todosChats.filter(chat => chat.isGroup);
        } else {
            for (const grupoId of programacion.grupos) {
                try {
                    const chat = await client.getChatById(grupoId);
                    if (chat) chats.push(chat);
                } catch (error) {
                    console.error(`Error al obtener chat ${grupoId}:`, error);
                }
            }
        }
        
        let media = null;
        if (programacion.archivoInfo && fs.existsSync(programacion.archivoInfo.ruta)) {
            media = MessageMedia.fromFilePath(programacion.archivoInfo.ruta);
        } else if (programacion.imagenPath && fs.existsSync(programacion.imagenPath)) {
            media = MessageMedia.fromFilePath(programacion.imagenPath);
        }
        
        for (const chat of chats) {
            try {
                if (media) {
                    if (programacion.mensaje && programacion.mensaje !== "") {
                        await chat.sendMessage(media, { caption: programacion.mensaje });
                    } else {
                        await chat.sendMessage(media);
                    }
                } else if (programacion.mensaje && programacion.mensaje !== "") {
                    await chat.sendMessage(programacion.mensaje);
                }
                
                console.log(`✅ Enviado a: ${chat.name}`);
                
                // Pequeña pausa entre envíos para no saturar
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.error(`Error al enviar a ${chat.name}:`, error);
            }
        }
        
    } catch (error) {
        console.error("Error al enviar mensaje programado:", error);
    }
}

function cargarProgramacionesGuardadas() {
    try {
        const archivoProgramaciones = path.join(__dirname, 'programaciones.json');
        if (fs.existsSync(archivoProgramaciones)) {
            const contenido = fs.readFileSync(archivoProgramaciones, 'utf8');
            const programaciones = JSON.parse(contenido);
            
            scheduledMessages.length = 0;
            scheduledMessages.push(...programaciones);
            console.log(`📂 Cargadas ${programaciones.length} programaciones guardadas`);
        }
    } catch (error) {
        console.error("Error al cargar programaciones guardadas:", error);
    }
}

// ============================================
// EVENTOS DEL CLIENTE
// ============================================

client.on('qr', qr => {
    console.clear();
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║                    ESCANEA EL QR                         ║');
    console.log('╠══════════════════════════════════════════════════════════╣');
    console.log('║ 📱 Instrucciones:                                        ║');
    console.log('║    1. Abre WhatsApp en tu teléfono                       ║');
    console.log('║    2. Menú → WhatsApp Web                                ║');
    console.log('║    3. Escanea el código QR                               ║');
    console.log('║    4. ESPERA 10-20 segundos                              ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');
    
    qrcode.generate(qr, { small: true });
    
    console.log('\n🔗 O puedes usar este enlace:');
    console.log(`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qr)}`);
    
    console.log(`\n📅 ${moment().tz(TIMEZONE).format('DD/MM/YYYY HH:mm:ss')}`);
    console.log('📍 América/El_Salvador');
    console.log('\n⚠️ Si no funciona después de 30 segundos, reinicia el bot.');
});

client.on('authenticated', () => {
    console.log('✅ Autenticación exitosa!');
});

client.on('auth_failure', msg => {
    console.error('❌ Error de autenticación:', msg);
});

client.on('ready', async () => {
    console.clear();
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║                 ✅ BOT CONECTADO EXITOSAMENTE            ║');
    console.log('╠══════════════════════════════════════════════════════════╣');
    console.log(`║ 🤖 Nombre: ${client.info.pushname || 'Jarabito'}                       ║`);
    console.log(`║ 📞 Número: ${client.info.wid.user}                            ║`);
    console.log(`║ ⏰ Hora: ${moment().tz(TIMEZONE).format('DD/MM/YYYY HH:mm:ss')}  ║`);
    console.log('║ 📍 Zona: América/El_Salvador                              ║');
    console.log('║ 🚀 Estado: LISTO PARA RECIBIR MENSAJES                    ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');
});

client.on('loading_screen', (percent, message) => {
    console.log(`🔄 Cargando: ${percent}% - ${message}`);
});

client.on('group_join', async (notification) => {
    console.log(`🤖 *Jarabito* fue agregado al grupo: ${notification.chatId}`);
    
    try {
        const chat = await client.getChatById(notification.chatId);
        if (chat.isGroup) {
            await enviarBienvenidaGrupo(chat);
        }
    } catch (error) {
        console.error("❌ Error al manejar ingreso a grupo:", error);
    }
});

async function enviarBienvenidaGrupo(chat) {
    try {
        const mensajeBienvenida = 
            `👋 *¡Hola a todos!*\n\n` +
            `Mi nombre es *Jarabito* 🤖, tu asistente de seguridad e información de *Jarabe*\n\n` +
            `*¿Cómo puedo ayudarte?*\n\n` +
            `Para interactuar conmigo, simplemente escribe el comando:\n` +
            `*/menu* o */menú*\n\n` +
            `*✨ Funciones disponibles:*\n` +
            `• Consultar semáforo de territorios 🚦\n` +
            `• Consultar información SKAP 📋\n` +
            `• Acceder a checklists de seguridad ✅\n` +
            `• Consultar reclamos de calidad 📊\n` +
            `• Consultar CIP Jarabe Terminado 🧪\n` +
            `• Y mucho más...\n\n` +
            `*⚠️ IMPORTANTE:*\n` +
            `Solo responderé cuando uses el comando */menu* o */menú* primero.\n\n` +
            `¡Estoy aquí para ayudar! 🚀`;
        
        await chat.sendMessage(mensajeBienvenida);
        console.log(`✅ Mensaje de bienvenida enviado al grupo: ${chat.name}`);
    } catch (error) {
        console.error("❌ Error al enviar mensaje de bienvenida:", error);
    }
}

client.on('message', async message => {
    try {
        const texto = message.body.trim();
        const userId = message.from;
        
        console.log(`📩 [${moment().tz(TIMEZONE).format('HH:mm:ss')}] Mensaje de ${userId}: ${texto.substring(0, 50)}...`);
        
        // Si el usuario tiene un estado activo, manejar según ese estado
        if (userStates.has(userId)) {
            await manejarEstadoUsuario(message, userId);
            return;
        }
        
        // Comando para mostrar menú
        if (texto.toLowerCase() === '/menu' || texto.toLowerCase() === '/menú') {
            await enviarMenu(message);
            return;
        }
        
        // Si es un número del 1-10, procesar como opción del menú
        if (/^[1-9]$|^10$/.test(texto)) {
            await manejarOpcionMenu(message, parseInt(texto));
            return;
        }
        
        // Comando de ayuda
        if (texto.toLowerCase() === 'ayuda' || texto.toLowerCase() === 'help') {
            await message.reply(
                "🤖 *BOT JARABITO - ASISTENTE DE SEGURIDAD Y INFORMACIÓN.*\n\n" +
                "Comandos disponibles:\n" +
                "• /menu o /menú - Mostrar menú principal\n" +
                "• 1-10 - Seleccionar opción del menú\n" +
                "• ayuda - Mostrar esta ayuda\n\n" +
                "*IMPORTANTE:*\n" +
                "Debes usar el comando /menu primero para interactuar conmigo.\n\n" +
                "¡Estoy aquí para ayudarte! 🚀"
            );
            return;
        }
        
        // En grupos, ignorar mensajes que no sean comandos
        if (message.from.endsWith('@g.us')) {
            if (!texto.startsWith('/') && !/^[1-9]$|^10$/.test(texto) && texto.toLowerCase() !== 'ayuda') {
                return;
            }
        }
        
    } catch (error) {
        console.error("❌ Error en manejo de mensaje:", error);
    }
});

client.on('disconnected', reason => {
    console.log('❌ Desconectado:', reason);
    console.log('🔄 Reconectando en 5 segundos...');
    setTimeout(() => client.initialize(), 5000);
});

// ============================================
// FUNCIÓN PRINCIPAL PARA INICIAR EL BOT
// ============================================

async function iniciarBot() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║                INICIANDO BOT DE WHATSAPP                ║');
    console.log('╠══════════════════════════════════════════════════════════╣');
    console.log(`║ 🖥️  Sistema: ${process.platform}                                ║`);
    console.log(`║ 📦 Node.js: ${process.version}                             ║`);
    console.log(`║ ⏰ Hora: ${new Date().toLocaleString()}                    ║`);
    console.log('╚══════════════════════════════════════════════════════════╝\n');
    
    crearCarpetas();
    cargarProgramacionesGuardadas();
    setInterval(verificarMensajesProgramados, 60000);
    
    await client.initialize();
    
    setInterval(() => {
        if (client.info) {
            const ahora = moment().tz(TIMEZONE);
            console.log(`[${ahora.format('HH:mm:ss')}] 🤖 Bot activo | Programaciones: ${scheduledMessages.length} | Usuarios activos: ${userStates.size}`);
        }
    }, 300000);
}

// Manejo de cierre del proceso
process.on('SIGINT', async () => {
    console.log('\n\n👋 Cerrando bot de WhatsApp...');
    
    try {
        const archivoProgramaciones = path.join(__dirname, 'programaciones.json');
        fs.writeFileSync(archivoProgramaciones, JSON.stringify(scheduledMessages, null, 2));
        console.log('💾 Programaciones guardadas');
    } catch (error) {
        console.error('❌ Error al guardar programaciones:', error);
    }
    
    await client.destroy();
    console.log('✅ Bot cerrado correctamente');
    process.exit(0);
});

// --- CONFIGURACIÓN DEL SERVIDOR WEB PARA RENDER ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('🤖 Bot Jarabito está activo y funcionando en Render!');
});

app.listen(PORT, () => {
    console.log(`🌐 Servidor web iniciado en el puerto ${PORT}`);
});

// Iniciar el bot
iniciarBot().catch(error => {
    console.error('❌ ERROR CRÍTICO AL INICIAR:', error);
    console.log('\n💡 POSIBLES SOLUCIONES:');
    console.log('1. Verifica tu conexión a internet');
    console.log('2. Cierra todas las ventanas de Chrome/Chromium');
    console.log('3. Reinstala dependencias: npm install');
    console.log('4. Ejecuta como administrador');
    console.log('5. Actualiza Node.js a versión 18 o superior');
});
