import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, SafeAreaView, ActivityIndicator, Alert, StatusBar } from 'react-native';
import { collection, query, where, onSnapshot, getDoc, doc, addDoc, serverTimestamp } from 'firebase/firestore';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';

// Íconos
import { Users, Scan, Tag, LogOut, Search, Building2, ShieldCheck, Eye, EyeOff, UserCheck, UserX, PlusCircle, Save, Barcode } from 'lucide-react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

const EMPRESAS_MAESTRAS = [
  { id: 0, nombre: "AGRICOLA CONVENTO VIEJO SPA", rut: "79.737.880-1" },
  { id: 1, nombre: "TORRETAGLE", rut: "76.064.746-2" }
];

export default function App() {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [userEmpresa, setUserEmpresa] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  const [workers, setWorkers] = useState([]);
  const [loadingData, setLoadingData] = useState(false);

  const [currentTab, setCurrentTab] = useState('list');
  const [search, setSearch] = useState('');
  const [selectedEmpresaFilter, setSelectedEmpresaFilter] = useState('TODAS');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Estados de la Cámara (Identificar)
  const [permission, requestPermission] = useCameraPermissions();
  const [isScanning, setIsScanning] = useState(false);
  const [scannedWorker, setScannedWorker] = useState(null);

  // Estados para Tarjas
  const [tarjas, setTarjas] = useState([]);
  const [isScanningTarja, setIsScanningTarja] = useState(false);
  const [tarjaWorker, setTarjaWorker] = useState(null);
  const [tarjaFolio, setTarjaFolio] = useState('');
  const [tarjaFundo, setTarjaFundo] = useState('');
  const [savingTarja, setSavingTarja] = useState(false);
  
  // Estado: Escáner del Bin/Caja
  const [isScanningBin, setIsScanningBin] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const roleDoc = await getDoc(doc(db, "userRoles", u.email.toLowerCase()));
          if (roleDoc.exists()) {
            const role = roleDoc.data().rol;
            const emp = roleDoc.data().empresaRut || "TODAS";
            setUserRole(role);
            setUserEmpresa(emp);
            setSelectedEmpresaFilter(emp);
          } else {
            setUserRole("Desconocido");
          }
        } catch (error) {
          setUserRole("Desconocido");
        }
      } else {
        setUserRole(null);
        setUserEmpresa(null);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || userRole === "Desconocido" || !userEmpresa) return;
    setLoadingData(true);

    let qworkers = collection(db, "workers");
    let qtarjas = collection(db, "tarjas");

    if (userEmpresa !== "TODAS") {
      qworkers = query(qworkers, where("empresaRut", "==", userEmpresa));
      qtarjas = query(qtarjas, where("empresaRut", "==", userEmpresa));
    }

    const unSubWorkers = onSnapshot(qworkers, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setWorkers(docs);
      setLoadingData(false);
    });

    const unSubTarjas = onSnapshot(qtarjas, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a,b) => (b.creadoEn?.seconds || 0) - (a.creadoEn?.seconds || 0));
      setTarjas(docs);
    });

    return () => { unSubWorkers(); unSubTarjas(); };
  }, [user, userRole, userEmpresa]);

  const handleLogin = async () => {
    if(!email || !password) return Alert.alert("Error", "Ingresa correo y contraseña");
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (error) {
      Alert.alert("Acceso denegado", "Credenciales incorrectas.");
    }
  };

  const handleLogout = () => signOut(auth);

  const handleBarCodeScanned = ({ data }) => {
    setIsScanning(false);
    const foundWorker = workers.find(w => w.codigoQR === data);
    setScannedWorker(foundWorker ? { found: true, data: foundWorker } : { found: false, rawCode: data });
  };

  const handleTarjaScanned = ({ data }) => {
    setIsScanningTarja(false);
    const foundWorker = workers.find(w => w.codigoQR === data);
    
    if (!foundWorker) return Alert.alert("Error", "Código no reconocido en la base de datos.");
    if (foundWorker.estado !== "Activo") return Alert.alert("Trabajador Inactivo", "No se pueden crear tarjas para personal inactivo.");
    
    setTarjaWorker(foundWorker);
  };

  const handleBinScanned = ({ data }) => {
    setIsScanningBin(false);
    setTarjaFolio(data); 
  };

  const handleSaveTarja = async () => {
    if (!tarjaFundo || !tarjaFolio) return Alert.alert("Campos vacíos", "Ingresa el fundo y el folio del bin.");
    setSavingTarja(true);
    try {
      await addDoc(collection(db, "tarjas"), {
        trabajadorRut: tarjaWorker.rut,
        trabajadorNombre: `${tarjaWorker.nombre} ${tarjaWorker.apellido}`,
        empresaRut: tarjaWorker.empresaRut,
        fundo: tarjaFundo,
        folioBin: tarjaFolio,
        supervisor: user.email,
        creadoEn: serverTimestamp()
      });
      Alert.alert("Éxito", "Tarja registrada correctamente.");
      setTarjaWorker(null);
      setTarjaFolio('');
      setTarjaFundo('');
    } catch (error) {
      Alert.alert("Error", "No se pudo guardar la tarja.");
    }
    setSavingTarja(false);
  };

  const filteredWorkers = workers.filter(w => {
    const q = search.toLowerCase();
    const matchSearch = !q || w.nombre?.toLowerCase().includes(q) || w.apellido?.toLowerCase().includes(q) || w.rut?.toLowerCase().includes(q);
    const matchEmpresa = userEmpresa === "TODAS" ? (selectedEmpresaFilter === 'TODAS' || w.empresaRut === selectedEmpresaFilter) : true;
    return matchSearch && matchEmpresa;
  });

  if (authLoading) return <View style={styles.centered}><ActivityIndicator size="large" color="#101c38" /></View>;

  if (!user) {
    return (
      <View style={styles.centered}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.loginCard}>
          <Text style={styles.title}>Control de Campo</Text>
          <Text style={styles.subtitle}>Módulo de Terreno Nacio</Text>
          <TextInput style={styles.input} placeholder="Correo electrónico" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <View style={styles.passwordContainer}>
            <TextInput style={styles.passwordInput} placeholder="Contraseña" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ padding: 10 }}>
              {showPassword ? <EyeOff size={20} color="#101c38" /> : <Eye size={20} color="#94a3b8" />}
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.btnPrimary} onPress={handleLogin}><Text style={styles.btnText}>Iniciar Sesión</Text></TouchableOpacity>
        </View>
      </View>
    );
  }

  if (userRole === "Desconocido") {
    return (
      <View style={styles.centered}>
        <Text style={[styles.title, { color: '#ef4444' }]}>Acceso Denegado</Text>
        <TouchableOpacity style={styles.btnSecondary} onPress={handleLogout}><Text>Cerrar Sesión</Text></TouchableOpacity>
      </View>
    );
  }

  const renderTarjaCard = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardName}>{item.trabajadorNombre}</Text>
        <Text style={{fontWeight: 'bold', color: '#16a34a'}}>Folio: {item.folioBin}</Text>
      </View>
      <View style={styles.cardDivider} />
      <View style={styles.cardRow}>
        <Text style={styles.cardValue}>Fundo: {item.fundo}</Text>
        <Text style={{fontSize: 11, color: '#94a3b8'}}>{item.supervisor.split('@')[0]}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <View style={styles.topbar}>
        <View>
          <Text style={styles.topbarTitle}>Control Terreno</Text>
          <Text style={styles.topbarSub}>{user.displayName || user.email}</Text>
        </View>
        <TouchableOpacity style={styles.btnLogout} onPress={handleLogout}><LogOut size={16} color="#ef4444" /></TouchableOpacity>
      </View>

      <View style={{ flex: 1 }}>
        
        {/* PESTAÑA 1: LISTADO */}
        {currentTab === 'list' && (
          <View style={{ flex: 1 }}>
             <View style={styles.searchBox}>
              <Search size={18} color="#94a3b8" style={{ marginRight: 10 }} />
              <TextInput style={styles.searchInputField} placeholder="Buscar por nombre, RUT..." value={search} onChangeText={setSearch} />
            </View>
            
            {/* SELECTOR EXCLUSIVO PARA ADMIN GLOBAL */}
            {userEmpresa === "TODAS" && (
              <View style={styles.filterRow}>
                <TouchableOpacity style={[styles.filterChip, selectedEmpresaFilter === 'TODAS' && styles.filterChipActive]} onPress={() => setSelectedEmpresaFilter('TODAS')}>
                  <Text style={[styles.filterChipText, selectedEmpresaFilter === 'TODAS' && styles.filterChipTextActive]}>TODAS</Text>
                </TouchableOpacity>
                {EMPRESAS_MAESTRAS.map(emp => (
                  <TouchableOpacity key={emp.id} style={[styles.filterChip, selectedEmpresaFilter === emp.rut && styles.filterChipActive]} onPress={() => setSelectedEmpresaFilter(emp.rut)}>
                    <Text style={[styles.filterChipText, selectedEmpresaFilter === emp.rut && styles.filterChipTextActive]}>{emp.nombre.replace("AGRICOLA ", "").split(" ")[0]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {loadingData ? <ActivityIndicator size="large" color="#101c38" style={{ marginTop: 40 }} /> : <FlatList data={filteredWorkers} keyExtractor={(item) => item.id} renderItem={({item}) => (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName}>{item.nombre} {item.apellido}</Text>
                    <Text style={styles.cardRut}>{item.rut}</Text>
                  </View>
                  <View style={[styles.badge, item.estado === 'Activo' ? styles.badgeActive : styles.badgeInactive]}>
                    <Text style={item.estado === 'Activo' ? styles.badgeTextActive : styles.badgeTextInactive}>{item.estado}</Text>
                  </View>
                </View>
                <View style={styles.cardDivider} />
                <View style={styles.cardRow}>
                  <View style={styles.metaBox}><Building2 size={14} color="#94a3b8" /><Text style={styles.cardValue} numberOfLines={1}>{EMPRESAS_MAESTRAS.find(e => e.rut === item.empresaRut)?.nombre.replace("AGRICOLA ", "") || item.empresaRut}</Text></View>
                  <View style={styles.metaBox}><ShieldCheck size={14} color="#94a3b8" /><Text style={styles.cardValue} numberOfLines={1}>{item.contratista ? item.contratista.split(" - ")[0] : "Directo"}</Text></View>
                </View>
              </View>
            )} contentContainerStyle={{ padding: 15 }} />}
          </View>
        )}

        {/* PESTAÑA 2: ESCÁNER */}
        {currentTab === 'scan' && (
          <View style={{ flex: 1 }}>
            {!isScanning && !scannedWorker && (
              <View style={styles.centered}>
                <View style={styles.placeholderScanCircle}><Scan size={50} color="#101c38" /></View>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#0f172a', marginTop: 20 }}>Escanear Credencial</Text>
                <Text style={{ color: '#64748b', textAlign: 'center', marginTop: 10, paddingHorizontal: 40, marginBottom: 30 }}>Apunta al código QR para identificar de forma instantánea al trabajador.</Text>
                <TouchableOpacity style={[styles.btnPrimary, {maxWidth: 250, marginTop: 20}]} onPress={() => { !permission?.granted ? requestPermission() : setIsScanning(true); }}>
                  <Text style={styles.btnText}>📷 Iniciar Escáner</Text>
                </TouchableOpacity>
              </View>
            )}
            {isScanning && (
              <View style={{ flex: 1, backgroundColor: '#000' }}>
                <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={handleBarCodeScanned} />
                <View style={styles.cameraOverlay}>
                  <View style={styles.scanFrame} />
                  <TouchableOpacity style={styles.btnCancelScan} onPress={() => setIsScanning(false)}><Text style={{ color: '#fff', fontWeight: 'bold' }}>Cancelar Escaneo</Text></TouchableOpacity>
                </View>
              </View>
            )}
            {scannedWorker && (
              <View style={styles.centered}>
                {scannedWorker.found ? (
                  <View style={[styles.resultCard, { borderColor: scannedWorker.data.estado === 'Activo' ? '#16a34a' : '#ef4444' }]}>
                    <UserCheck size={50} color={scannedWorker.data.estado === 'Activo' ? '#16a34a' : '#ef4444'} style={{ alignSelf: 'center', marginBottom: 15 }} />
                    <Text style={{ fontSize: 22, fontWeight: 'bold', textAlign: 'center', color: '#0f172a' }}>{scannedWorker.data.nombre} {scannedWorker.data.apellido}</Text>
                    <Text style={{ fontSize: 16, textAlign: 'center', color: '#64748b', marginBottom: 15 }}>{scannedWorker.data.rut}</Text>
                    
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderColor: '#e2e8f0' }}>
                      <Text style={{ color: '#64748b' }}>Estado:</Text>
                      <Text style={{ fontWeight: 'bold', color: scannedWorker.data.estado === 'Activo' ? '#16a34a' : '#ef4444' }}>{scannedWorker.data.estado.toUpperCase()}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderColor: '#e2e8f0' }}>
                      <Text style={{ color: '#64748b' }}>Empresa:</Text>
                      <Text style={{ fontWeight: 'bold', color: '#0f172a' }}>{EMPRESAS_MAESTRAS.find(e => e.rut === scannedWorker.data.empresaRut)?.nombre.replace("AGRICOLA ", "") || "Desconocida"}</Text>
                    </View>
                  </View>
                ) : (
                  <View style={[styles.resultCard, { borderColor: '#ef4444' }]}>
                    <UserX size={50} color="#ef4444" style={{ alignSelf: 'center', marginBottom: 15 }} />
                    <Text style={{ fontSize: 20, fontWeight: 'bold', textAlign: 'center', color: '#0f172a' }}>Código No Reconocido</Text>
                  </View>
                )}
                <TouchableOpacity style={[styles.btnPrimary, { width: '80%', marginTop: 30 }]} onPress={() => { setScannedWorker(null); setIsScanning(true); }}><Text style={styles.btnText}>📷 Escanear Otro</Text></TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* PESTAÑA 3: TARJAS DE COSECHA */}
        {currentTab === 'tarjas' && (
          <View style={{ flex: 1 }}>
            
            {/* Lista y botón Nueva Tarja */}
            {!isScanningTarja && !tarjaWorker && !isScanningBin && (
              <View style={{ flex: 1 }}>
                <TouchableOpacity style={styles.btnNewTarja} onPress={() => { !permission?.granted ? requestPermission() : setIsScanningTarja(true); }}>
                  <PlusCircle size={20} color="#fff" />
                  <Text style={{color: '#fff', fontWeight: 'bold', fontSize: 16, marginLeft: 8}}>Nueva Tarja</Text>
                </TouchableOpacity>
                {tarjas.length === 0 ? <View style={styles.centered}><Text style={{ color: '#64748b' }}>No hay tarjas registradas hoy.</Text></View> : <FlatList data={tarjas} keyExtractor={(item) => item.id} renderItem={renderTarjaCard} contentContainerStyle={{ padding: 15 }} />}
              </View>
            )}

            {/* Escáner de Trabajador */}
            {isScanningTarja && (
              <View style={{ flex: 1, backgroundColor: '#000' }}>
                <Text style={styles.scanInstruction}>Escanea el QR del Trabajador</Text>
                <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={handleTarjaScanned} />
                <TouchableOpacity style={styles.btnCancelScan} onPress={() => setIsScanningTarja(false)}><Text style={{ color: '#fff' }}>Cancelar</Text></TouchableOpacity>
              </View>
            )}

            {/* Escáner del Bin/Caja */}
            {isScanningBin && (
              <View style={{ flex: 1, backgroundColor: '#000' }}>
                <Text style={styles.scanInstruction}>Escanea el código del Bin / Caja</Text>
                <CameraView style={{ flex: 1 }} facing="back" onBarcodeScanned={handleBinScanned} />
                <TouchableOpacity style={styles.btnCancelScan} onPress={() => setIsScanningBin(false)}><Text style={{ color: '#fff' }}>Volver al formulario</Text></TouchableOpacity>
              </View>
            )}

            {/* Formulario */}
            {tarjaWorker && !isScanningBin && (
              <View style={{ padding: 20 }}>
                <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#0f172a', marginBottom: 20 }}>Registrar Cosecha</Text>
                
                <View style={[styles.card, {backgroundColor: '#f8fafc'}]}>
                  <Text style={{color: '#64748b', fontSize: 12}}>Trabajador</Text>
                  <Text style={{fontSize: 16, fontWeight: 'bold', color: '#101c38'}}>{tarjaWorker.nombre} {tarjaWorker.apellido}</Text>
                  <Text style={{color: '#64748b', fontSize: 12, marginTop: 5}}>Empresa: {EMPRESAS_MAESTRAS.find(e => e.rut === tarjaWorker.empresaRut)?.nombre.replace("AGRICOLA ", "")}</Text>
                </View>

                <Text style={styles.formLabel}>Fundo / Cuartel</Text>
                <TextInput style={styles.input} placeholder="Ej. Fundo Los Nogales" value={tarjaFundo} onChangeText={setTarjaFundo} />

                <Text style={styles.formLabel}>Folio del Bin / Caja</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TextInput 
                    style={[styles.input, { flex: 1, marginBottom: 0 }]} 
                    placeholder="Escribir o Escanear..." 
                    value={tarjaFolio} 
                    onChangeText={setTarjaFolio} 
                    keyboardType="numeric" 
                  />
                  <TouchableOpacity style={styles.btnScanInline} onPress={() => setIsScanningBin(true)}>
                    <Barcode size={24} color="#fff" />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={[styles.btnPrimary, {flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 30}]} onPress={handleSaveTarja} disabled={savingTarja}>
                  {savingTarja ? <ActivityIndicator color="#fff" /> : <><Save size={20} color="#fff" /><Text style={styles.btnText}>Guardar Tarja</Text></>}
                </TouchableOpacity>

                <TouchableOpacity style={{ marginTop: 20, alignItems: 'center' }} onPress={() => setTarjaWorker(null)}>
                  <Text style={{ color: '#ef4444', fontWeight: 'bold' }}>Cancelar todo</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>

      <View style={styles.bottomTabs}>
        <TouchableOpacity style={[styles.tabButton, currentTab === 'list' && styles.tabButtonActive]} onPress={() => { setCurrentTab('list'); setIsScanning(false); setScannedWorker(null); setIsScanningTarja(false); setTarjaWorker(null); setIsScanningBin(false); }}>
          <Users size={22} color={currentTab === 'list' ? '#101c38' : '#94a3b8'} />
          <Text style={[styles.tabLabel, currentTab === 'list' && styles.tabLabelActive]}>Personal</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabButton, currentTab === 'scan' && styles.tabButtonActive]} onPress={() => { setCurrentTab('scan'); setIsScanningTarja(false); setTarjaWorker(null); setIsScanningBin(false); }}>
          <Scan size={22} color={currentTab === 'scan' ? '#101c38' : '#94a3b8'} />
          <Text style={[styles.tabLabel, currentTab === 'scan' && styles.tabLabelActive]}>Identificar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabButton, currentTab === 'tarjas' && styles.tabButtonActive]} onPress={() => { setCurrentTab('tarjas'); setIsScanning(false); setScannedWorker(null); }}>
          <Tag size={22} color={currentTab === 'tarjas' ? '#16a34a' : '#94a3b8'} />
          <Text style={[styles.tabLabel, currentTab === 'tarjas' && styles.tabLabelActive]}>Tarjas</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loginCard: { width: '100%', backgroundColor: '#fff', padding: 25, borderRadius: 12, elevation: 3 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#101c38', marginBottom: 5, textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#64748b', marginBottom: 25, textAlign: 'center' },
  input: { width: '100%', height: 50, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 15, marginBottom: 15, fontSize: 16 },
  passwordContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, marginBottom: 15 },
  passwordInput: { flex: 1, height: 50, paddingHorizontal: 15, fontSize: 16 },
  btnPrimary: { width: '100%', backgroundColor: '#101c38', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  btnSecondary: { padding: 15, alignItems: 'center' },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  topbarTitle: { fontSize: 20, fontWeight: '900', color: '#101c38' },
  topbarSub: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  btnLogout: { backgroundColor: '#fee2e2', padding: 10, borderRadius: 8 },
  
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', margin: 15, paddingHorizontal: 15, height: 48, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  searchInputField: { flex: 1, fontSize: 15, color: '#0f172a' },
  filterRow: { flexDirection: 'row', paddingHorizontal: 15, marginBottom: 10, gap: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#e2e8f0' },
  filterChipActive: { backgroundColor: '#101c38' },
  filterChipText: { fontSize: 12, fontWeight: 'bold', color: '#475569' },
  filterChipTextActive: { color: '#fff' },

  card: { backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0', marginHorizontal: 15, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardName: { fontSize: 17, fontWeight: 'bold', color: '#0f172a', textTransform: 'capitalize' },
  cardRut: { fontSize: 13, color: '#64748b', fontFamily: 'monospace', marginTop: 1 },
  cardDivider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 12 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 15 },
  cardValue: { fontSize: 13, color: '#475569', fontWeight: '500' },
  metaBox: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },

  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeActive: { backgroundColor: '#dcfce7' },
  badgeInactive: { backgroundColor: '#fee2e2' },
  badgeTextActive: { color: '#166534', fontWeight: 'bold', fontSize: 11 },
  badgeTextInactive: { color: '#991b1b', fontWeight: 'bold', fontSize: 11 },

  /* 🔥 ESPACIO PARA LA BARRA NATIVA DEL TELÉFONO 🔥 */
  bottomTabs: { flexDirection: 'row', height: 85, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#e2e8f0', paddingBottom: 25 },
  
  tabButton: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 4 },
  tabButtonActive: { borderTopWidth: 2, borderTopColor: '#101c38', marginTop: -1 },
  tabLabel: { fontSize: 11, color: '#94a3b8', fontWeight: '600' },
  tabLabelActive: { color: '#101c38', fontWeight: 'bold' },

  btnCancelScan: { position: 'absolute', bottom: 40, alignSelf: 'center', backgroundColor: '#ef4444', paddingHorizontal: 25, paddingVertical: 12, borderRadius: 30 },
  btnNewTarja: { flexDirection: 'row', backgroundColor: '#16a34a', padding: 15, borderRadius: 10, margin: 15, justifyContent: 'center', alignItems: 'center', elevation: 2 },
  scanInstruction: { position: 'absolute', top: 50, alignSelf: 'center', color: '#fff', fontSize: 18, fontWeight: 'bold', zIndex: 10, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  formLabel: { fontSize: 14, fontWeight: 'bold', color: '#475569', marginBottom: 5, marginLeft: 5 },
  btnScanInline: { backgroundColor: '#101c38', paddingHorizontal: 20, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },

  placeholderScanCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#e2e8f0', justifyContent: 'center', alignItems: 'center' },
  cameraOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  scanFrame: { width: 250, height: 250, borderWidth: 3, borderColor: '#16a34a', borderRadius: 20, backgroundColor: 'transparent' },
  resultCard: { width: '90%', backgroundColor: '#fff', padding: 25, borderRadius: 16, borderWidth: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 5 }
});