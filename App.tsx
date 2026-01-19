
import React, { useState, useMemo } from 'react';
import { 
  Package, 
  Users, 
  BarChart3, 
  Upload, 
  AlertTriangle, 
  TrendingUp, 
  FileText,
  PlusCircle,
  History,
  CheckCircle2,
  X,
  Printer,
  ChevronRight,
  ClipboardList,
  FileCheck,
  Layers,
  ArrowLeft,
  Database,
  ShieldCheck,
  Plus,
  FileSpreadsheet,
  Loader2,
  Trash2,
  RefreshCw
} from 'lucide-react';
import { ViewState, Product, Customer, Order, ProcessingResult, Analytics } from './types';
import { processLedgerInput, generateChallanMarkdown } from './services/geminiService';

const INITIAL_PRODUCTS: Product[] = [
  { sku: 'VLV-304-1PC-14', name: 'SS IC Ball Valve 1PC S/E', grade: '304', size: '1/4"', stock: 150, initialStock: 150, price: 188 },
  { sku: 'VLV-316-1PC-14', name: 'SS IC Ball Valve 1PC S/E', grade: '316', size: '1/4"', stock: 120, initialStock: 120, price: 260 },
  { sku: 'VLV-304-3PC-12', name: 'SS IC Ball Valve 3PC (S/E / S/W / F/E)', grade: '304', size: '1/2"', stock: 85, initialStock: 85, price: 850 },
  { sku: 'VLV-316-3PC-12', name: 'SS IC Ball Valve 3PC (S/E / S/W / F/E)', grade: '316', size: '1/2"', stock: 65, initialStock: 65, price: 1150 },
  { sku: 'VLV-304-MNI-14', name: 'SS IC Mini Ball Valve S/E', grade: '304', size: '1/4"', stock: 200, initialStock: 200, price: 145 },
  { sku: 'FIT-304-ELB-12', name: 'SS IC Elbow', grade: '304', size: '1/2"', stock: 800, initialStock: 800, price: 45 },
  { sku: 'FIT-316-ELB-12', name: 'SS IC Elbow', grade: '316', size: '1/2"', stock: 650, initialStock: 650, price: 68 },
  { sku: 'FIT-304-SKT-10', name: 'SS IC Socket', grade: '304', size: '1"', stock: 400, initialStock: 400, price: 85 },
  { sku: 'FIT-316-SKT-10', name: 'SS IC Socket', grade: '316', size: '1"', stock: 350, initialStock: 350, price: 115 },
  { sku: 'DRY-304-BTY-15', name: 'SS 304 Dairy Butterfly Valve', grade: '304', size: '1 1/2"', stock: 45, initialStock: 45, price: 1850 },
  { sku: 'FLG-304-150S-10', name: 'SS 304 Flanges Class 150 Surf', grade: '304', size: '1"', stock: 100, initialStock: 100, price: 780 },
  { sku: 'FAS-304-BLT-12', name: 'SS Bolt 304 / 316', grade: '304', size: '1/2"', stock: 2000, initialStock: 2000, price: 15 },
];

export default function App() {
  const [activeView, setActiveView] = useState<ViewState>(ViewState.DASHBOARD);
  const [inventory, setInventory] = useState<Product[]>(INITIAL_PRODUCTS);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<ProcessingResult | null>(null);
  const [inputMode, setInputMode] = useState<'file' | 'text'>('file');
  const [rawText, setRawText] = useState('');
  const [challanModal, setChallanModal] = useState<{ open: boolean, content: string }>({ open: false, content: '' });
  const [selectedProductGroup, setSelectedProductGroup] = useState<string | null>(null);
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);

  const analytics: Analytics = useMemo(() => {
    const totalInventoryValue = inventory.reduce((acc, curr) => acc + (curr.stock * curr.price), 0);
    const lowStockCount = inventory.filter(i => i.stock < (i.initialStock * 0.1)).length;
    const totalSales = customers.reduce((acc, c) => 
      acc + c.orderHistory.filter(o => o.type === 'SALE').reduce((sum, o) => sum + o.totalAmount, 0)
    , 0);
    const productFrequency: Record<string, number> = {};
    customers.forEach(c => c.orderHistory.forEach(o => o.items.forEach(i => {
        productFrequency[i.sku] = (productFrequency[i.sku] || 0) + i.qty;
    })));
    let topSku = Object.keys(productFrequency).reduce((a, b) => productFrequency[a] > productFrequency[b] ? a : b, '');
    const topProduct = inventory.find(p => p.sku === topSku) || null;
    return { totalInventoryValue, lowStockCount, totalSales, topProduct };
  }, [inventory, customers]);

  const handleProcessInput = async (e?: React.ChangeEvent<HTMLInputElement>) => {
    setIsProcessing(true);
    let payload: any = {};
    try {
      if (inputMode === 'file' && e?.target.files?.[0]) {
          const file = e.target.files[0];
          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve, reject) => {
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(file);
          });
          const base64 = await base64Promise;
          payload = { data: base64, mimeType: file.type };
      } else {
          if (!rawText.trim()) { setIsProcessing(false); return; }
          payload = { text: rawText };
      }
      const context = JSON.stringify(inventory.map(i => ({ sku: i.sku, n: i.name, g: i.grade, s: i.size })));
      const result = await processLedgerInput(payload, context);
      const { newInventory, affectedItems } = calculateTransactionEffects(inventory, result);
      setInventory(newInventory);
      if (result.transactionType === 'SALE' && result.customerInfo) {
        updateCustomerHistory(result.customerInfo, result.extractedItems);
      }
      setLastResult({ ...result, affectedItems });
      setRawText('');
      setActiveView(ViewState.UPLOADS);
    } catch (error) {
      alert("Nivee Sync Failure: AI Engine timeout.");
    } finally { setIsProcessing(false); }
  };

  const calculateTransactionEffects = (currentInv: Product[], result: ProcessingResult) => {
    const nextInv = [...currentInv];
    const affected: ProcessingResult['affectedItems'] = [];
    
    result.extractedItems.forEach(item => {
      const safeName = (item.name || "").replace(/\s+/g, ' ').trim();
      const safeGrade = (item.grade || "").replace(/\D/g, '').trim() || item.grade;
      const safeSize = (item.size || "").trim();
      if (!safeName || !safeSize) return;

      let index = nextInv.findIndex(p => p.sku.trim().toLowerCase() === item.sku.trim().toLowerCase());
      if (index === -1) {
        index = nextInv.findIndex(p => 
          p.name.toLowerCase().trim() === safeName.toLowerCase().trim() && 
          p.grade.toLowerCase().trim() === safeGrade.toLowerCase().trim() && 
          p.size.toLowerCase().trim() === safeSize.toLowerCase().trim()
        );
      }

      if (index !== -1) {
        const prevStock = nextInv[index].stock;
        const diff = (item.qty || 0);
        const newStock = result.transactionType === 'SALE' ? prevStock - diff : prevStock + diff;
        nextInv[index] = { ...nextInv[index], stock: newStock };
        affected.push({ sku: nextInv[index].sku, previousStock: prevStock, newStock });
      } else {
        const qty = item.qty || 0;
        const newProd: Product = {
          sku: item.sku || `NEW-${safeName.substring(0,3).toUpperCase()}-${safeGrade}-${Date.now().toString().slice(-4)}`,
          name: safeName,
          grade: safeGrade,
          size: safeSize,
          stock: result.transactionType === 'SALE' ? -qty : qty,
          initialStock: qty,
          price: item.price || 0
        };
        nextInv.push(newProd);
        affected.push({ sku: newProd.sku, previousStock: 0, newStock: newProd.stock });
      }
    });
    return { newInventory: nextInv, affectedItems: affected };
  };

  const updateCustomerHistory = (info: any, items: any[]) => {
    setCustomers(prev => {
      const next = [...prev];
      const idx = next.findIndex(c => (c.name || "").toLowerCase().trim() === (info.name || "").toLowerCase().trim());
      const order: Order = {
        id: `CHL-${Date.now()}`,
        date: new Date().toISOString(),
        type: 'SALE',
        items: items.map(i => ({ sku: i.sku || "N/A", qty: i.qty || 0, price: i.price || 0 })),
        totalAmount: items.reduce((acc, curr) => acc + ((curr.qty || 0) * (curr.price || 0)), 0)
      };
      if (idx !== -1) { next[idx] = { ...next[idx], orderHistory: [order, ...next[idx].orderHistory] }; }
      else { next.push({ id: `CST-${Date.now()}`, name: info.name, email: 'N/A', contact: info.contact || 'N/A', orderHistory: [order] }); }
      return next;
    });
  };

  const handleBulkInventoryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    setIsProcessing(true);
    try {
      const file = e.target.files[0];
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      const base64 = await base64Promise;
      const context = JSON.stringify(inventory.map(i => ({ sku: i.sku, n: i.name, g: i.grade, s: i.size })));
      const result = await processLedgerInput({ data: base64, mimeType: file.type }, `MODE: BULK_SYNC`);
      result.transactionType = 'PURCHASE';
      const { newInventory, affectedItems } = calculateTransactionEffects(inventory, result);
      setInventory(newInventory);
      setLastResult({ ...result, affectedItems });
      setActiveView(ViewState.UPLOADS);
    } catch (e) {
      alert("Bulk sync failed.");
    } finally { setIsProcessing(false); }
  };

  const handleGenerateChallan = async (customer: Customer) => {
    setIsProcessing(true);
    try {
        const lastOrder = customer.orderHistory[0];
        const items = lastOrder.items.map(i => {
            const p = inventory.find(prod => prod.sku.trim() === i.sku.trim());
            return { name: p?.name, grade: p?.grade, size: p?.size, qty: i.qty };
        });
        const markdown = await generateChallanMarkdown(customer.name, items);
        setChallanModal({ open: true, content: markdown });
    } catch (e) { alert("Document generation failed."); }
    finally { setIsProcessing(false); }
  };

  const handleDeleteItem = (sku: string) => {
    console.log("Sync Command: Purge variant SKU ->", sku);
    setInventory(prev => {
        const next = prev.filter(item => (item.sku || "").trim().toLowerCase() !== sku.trim().toLowerCase());
        console.log("Purge Complete. New State Count:", next.length);
        return next;
    });
  };

  const handleDeleteCategory = (categoryName: string) => {
    console.log("Sync Command: Purge family ->", categoryName);
    const normalizedTarget = categoryName.trim().toLowerCase();
    setInventory(prev => {
        const next = prev.filter(item => (item.name || "").trim().toLowerCase() !== normalizedTarget);
        console.log("Purge Complete. New State Count:", next.length);
        return next;
    });
    setSelectedProductGroup(null);
  };

  const handleResetInventory = () => {
    if (window.confirm("CRITICAL: Wipe master ledger?")) {
      setInventory([]);
      setLastResult(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 text-slate-900">
      <aside className="w-full md:w-72 bg-slate-900 text-slate-300 flex flex-col shrink-0 sticky top-0 h-auto md:h-screen z-10">
        <div className="p-8">
          <div className="flex items-center gap-3 mb-2">
             <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
                <ShieldCheck size={24} className="text-white" />
             </div>
             <h1 className="text-xl font-black text-white tracking-tighter uppercase">Nivee Metal</h1>
          </div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">State Intelligence</p>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          <NavLink active={activeView === ViewState.DASHBOARD} icon={<BarChart3 size={20}/>} label="Dashboard" onClick={() => setActiveView(ViewState.DASHBOARD)} />
          <NavLink active={activeView === ViewState.INVENTORY} icon={<Database size={20}/>} label="Inventory" onClick={() => setActiveView(ViewState.INVENTORY)} />
          <NavLink active={activeView === ViewState.CRM} icon={<Users size={20}/>} label="Clients" onClick={() => setActiveView(ViewState.CRM)} />
          <NavLink active={activeView === ViewState.UPLOADS} icon={<FileCheck size={20}/>} label="Ledger Sync" onClick={() => setActiveView(ViewState.UPLOADS)} />
        </nav>
        <div className="p-6 border-t border-slate-800">
           <button onClick={() => { setActiveView(ViewState.UPLOADS); setInputMode('text'); }} className="flex items-center justify-center gap-2 w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl transition-all font-bold shadow-lg shadow-blue-900/20 active:scale-95">
              <PlusCircle size={20} /> SYNC DATA
           </button>
        </div>
      </aside>

      <main className="flex-1 p-6 md:p-12 overflow-y-auto">
        <header className="mb-10 flex flex-col md:flex-row justify-between md:items-end gap-4">
          <div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase">{activeView}</h2>
            <p className="text-slate-500 font-medium mt-1 tracking-tight">Syncing industrial state with AI accuracy.</p>
          </div>
          <div className="flex items-center gap-4">
            {isProcessing && (
              <div className="px-5 py-3 bg-blue-600 rounded-2xl flex items-center gap-3 text-white font-black text-xs shadow-xl animate-pulse">
                <Loader2 size={16} className="animate-spin" /> ENGINE SYNCING...
              </div>
            )}
            {activeView === ViewState.INVENTORY && !selectedProductGroup && (
              <div className="flex gap-3">
                <button onClick={handleResetInventory} title="Wipe Ledger" className="p-3 bg-white border border-slate-200 text-red-500 rounded-2xl hover:bg-red-50 transition-all shadow-sm active:scale-95">
                  <RefreshCw size={18}/>
                </button>
                <label className="px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-2xl font-bold flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm cursor-pointer active:scale-95">
                  <FileSpreadsheet size={18} className="text-emerald-600"/> BULK SYNC
                  <input type="file" className="hidden" accept=".xlsx,.xls,.csv,.pdf" onChange={handleBulkInventoryUpload} />
                </label>
                <button onClick={() => setIsAddProductModalOpen(true)} className="px-6 py-3 bg-slate-900 text-white rounded-2xl font-bold flex items-center gap-2 hover:bg-slate-800 shadow-lg active:scale-95">
                  <Plus size={18}/> ADD ITEM
                </button>
              </div>
            )}
          </div>
        </header>

        {activeView === ViewState.DASHBOARD && <DashboardView analytics={analytics} inventory={inventory} customers={customers} onChallan={handleGenerateChallan} />}
        {activeView === ViewState.INVENTORY && <InventoryGroupedView products={inventory} selectedGroup={selectedProductGroup} onGroupClick={setSelectedProductGroup} onDelete={handleDeleteItem} onDeleteCategory={handleDeleteCategory} />}
        {activeView === ViewState.CRM && <CRMView customers={customers} onGenerateChallan={handleGenerateChallan} />}
        {activeView === ViewState.UPLOADS && (
            <div className="space-y-8">
                <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm">
                    <div className="flex bg-slate-100 p-1 rounded-2xl w-fit mb-10">
                        <button onClick={() => setInputMode('file')} className={`px-8 py-2 rounded-xl text-sm font-bold transition-all ${inputMode === 'file' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>DOCUMENT SCAN</button>
                        <button onClick={() => setInputMode('text')} className={`px-8 py-2 rounded-xl text-sm font-bold transition-all ${inputMode === 'text' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>MANUAL NOTE</button>
                    </div>
                    {inputMode === 'file' ? (
                        <div className="border-4 border-dotted border-slate-100 rounded-[3rem] p-16 text-center hover:border-blue-200 transition-all group">
                            <Upload size={48} className="text-slate-200 group-hover:text-blue-500 mx-auto mb-6 transition-colors" />
                            <h3 className="text-2xl font-black text-slate-800 mb-2 tracking-tight">Synchronize Master Data</h3>
                            <p className="text-slate-400 mb-10 max-w-sm mx-auto font-medium leading-relaxed">Upload industrial CSV, Excel, or Invoice PDF. The sync engine identifies every single variant with grade precision.</p>
                            <label className="px-12 py-5 bg-slate-900 text-white rounded-[1.5rem] cursor-pointer font-black text-sm hover:bg-blue-600 transition-all inline-flex items-center gap-3 shadow-xl active:scale-95">
                                <PlusCircle size={20}/> ATTACH DOCUMENT
                                <input type="file" className="hidden" onChange={handleProcessInput} />
                            </label>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <textarea 
                                value={rawText} onChange={(e) => setRawText(e.target.value)}
                                placeholder="E.g., 'Received 50 units of SS 304 Ball Valve 1/2 from supplier. Sold 10 to Acme Corp.'"
                                className="w-full h-56 bg-slate-50 border border-slate-200 rounded-[2rem] p-8 focus:ring-4 focus:ring-blue-100 outline-none font-bold text-slate-700 leading-relaxed text-lg"
                            />
                            <button onClick={() => handleProcessInput()} disabled={!rawText.trim() || isProcessing} className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-lg tracking-tight hover:bg-blue-600 transition-all shadow-2xl active:scale-95">EXECUTE SYNC</button>
                        </div>
                    )}
                </div>
                {lastResult && <ProcessingResultCard result={lastResult} />}
            </div>
        )}
      </main>

      {challanModal.open && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-6 z-50">
            <div className="bg-white rounded-[3rem] w-full max-w-4xl shadow-2xl overflow-hidden">
                <div className="p-8 border-b flex justify-between items-center bg-slate-50/50">
                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-3">
                        <FileText size={24} className="text-blue-600"/> Document Preview
                    </h3>
                    <div className="flex gap-3">
                        <button className="p-4 bg-white border rounded-2xl text-slate-600 hover:bg-slate-50"><Printer size={20}/></button>
                        <button onClick={() => setChallanModal({ open: false, content: '' })} className="p-4 hover:bg-red-50 text-red-500 rounded-2xl"><X size={20}/></button>
                    </div>
                </div>
                <div className="p-12 max-h-[75vh] overflow-y-auto">
                    <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed bg-slate-900 p-10 rounded-[2.5rem] border border-slate-800 text-blue-100">{challanModal.content}</pre>
                </div>
            </div>
        </div>
      )}

      {isAddProductModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-[2.5rem] w-full max-w-xl shadow-2xl overflow-hidden p-8">
              <div className="flex justify-between items-center mb-8 border-b pb-6">
                <h3 className="text-xl font-black text-slate-900 tracking-tight">MANUAL ITEM ENTRY</h3>
                <button onClick={() => setIsAddProductModalOpen(false)} className="p-3 text-red-500 hover:bg-red-50 rounded-xl transition-colors"><X size={20}/></button>
              </div>
              <AddProductForm onAdd={(p:any) => { setInventory(prev => [...prev, p]); setIsAddProductModalOpen(false); }} />
          </div>
        </div>
      )}
    </div>
  );
}

function NavLink({ active, icon, label, onClick }: any) {
    return (
        <button 
            onClick={onClick}
            className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all font-bold tracking-tight ${active ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/30' : 'hover:bg-slate-800 text-slate-400'}`}
        >
            {icon} <span className="truncate">{label}</span>
        </button>
    );
}

function DashboardView({ analytics, inventory, customers, onChallan }: any) {
    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard icon={<TrendingUp size={24}/>} label="Volume ($)" value={`$${analytics.totalSales.toLocaleString()}`} color="blue" />
                <StatCard icon={<Package size={24}/>} label="Inventory ($)" value={`$${analytics.totalInventoryValue.toLocaleString()}`} color="purple" />
                <StatCard icon={<AlertTriangle size={24}/>} label="Alerts" value={analytics.lowStockCount.toString()} color="amber" />
                <StatCard icon={<Layers size={24}/>} label="Popular" value={analytics.topProduct ? analytics.topProduct.size : 'N/A'} subValue={analytics.topProduct?.name || ''} color="emerald" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm">
                    <h3 className="text-lg font-black mb-8 uppercase tracking-tight flex items-center gap-3"><History size={20} className="text-blue-600"/> Automated Watchlist</h3>
                    <div className="space-y-6">
                        {inventory.filter((i:any) => i.stock < i.initialStock * 0.1).length === 0 ? <p className="text-slate-400 font-bold italic">All supplies optimal.</p> : 
                        inventory.filter((i:any) => i.stock < i.initialStock * 0.1).slice(0, 6).map((item: any) => {
                             const p = (item.stock / item.initialStock) * 100;
                             return (
                                <div key={item.sku} className="space-y-3">
                                    <div className="flex justify-between text-xs font-black text-slate-700 uppercase tracking-tighter">
                                        <span>{item.name} <span className="text-blue-600 ml-2">SS {item.grade} | {item.size}</span></span>
                                        <span className="text-red-600">{item.stock} / {item.initialStock}</span>
                                    </div>
                                    <div className="h-4 bg-slate-50 rounded-full overflow-hidden border">
                                        <div className="h-full bg-red-500 rounded-full" style={{ width: `${Math.max(5, p)}%` }}></div>
                                    </div>
                                </div>
                             );
                        })}
                    </div>
                </div>
                <div className="bg-slate-900 p-10 rounded-[3rem] text-white shadow-2xl">
                    <h3 className="text-lg font-black mb-8 uppercase flex items-center gap-3"><Users size={20} className="text-blue-500"/> Recent Activity</h3>
                    <div className="space-y-5">
                        {customers.length === 0 ? <p className="text-slate-500">Waiting for sync data...</p> : 
                        customers.slice(0, 5).map((c: any) => (
                            <div key={c.id} className="flex justify-between items-center bg-white/5 p-5 rounded-2xl border border-white/5 hover:bg-white/10 transition-all">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-black text-sm">{(c.name || "C").charAt(0)}</div>
                                    <div className="text-sm font-black tracking-tight truncate max-w-[120px]">{c.name}</div>
                                </div>
                                <button onClick={() => onChallan(c)} className="p-3 bg-white/10 rounded-xl hover:bg-blue-600 transition-colors"><ChevronRight size={18}/></button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatCard({ icon, label, value, subValue, color }: any) {
    const colors: Record<string, string> = { blue: 'bg-blue-50 text-blue-600', purple: 'bg-purple-50 text-purple-600', amber: 'bg-amber-50 text-amber-600', emerald: 'bg-emerald-50 text-emerald-600' };
    return (
        <div className="bg-white p-8 rounded-[2rem] border border-slate-200 flex items-start justify-between shadow-sm">
            <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
                <p className="text-3xl font-black text-slate-900">{value}</p>
                {subValue && <p className="text-[10px] text-slate-500 font-bold mt-2 truncate max-w-[130px] uppercase">{subValue}</p>}
            </div>
            <div className={`p-4 rounded-2xl ${colors[color]}`}>{icon}</div>
        </div>
    );
}

function InventoryGroupedView({ products, selectedGroup, onGroupClick, onDelete, onDeleteCategory }: any) {
    const grouped = useMemo(() => {
        return products.reduce((acc: Record<string, Product[]>, p: any) => {
            const nameKey = (p.name || "").trim();
            acc[nameKey] = acc[nameKey] || [];
            acc[nameKey].push(p);
            return acc;
        }, {});
    }, [products]);

    // Detail view for a specific family
    if (selectedGroup) {
        const items = grouped[selectedGroup.trim()] || [];
        return (
            <div className="space-y-8 animate-in slide-in-from-right-8 duration-500">
                <div className="flex justify-between items-center bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
                    <button onClick={() => onGroupClick(null)} className="flex items-center gap-2 px-6 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-black hover:bg-white transition-all shadow-sm">
                        <ArrowLeft size={18} /> BACK TO FAMILIES
                    </button>
                    <button 
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onDeleteCategory(selectedGroup);
                        }}
                        className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-xl font-black hover:bg-red-700 transition-all shadow-md active:scale-95"
                    >
                        <Trash2 size={18} /> PURGE FAMILY VARIATIONS
                    </button>
                </div>
                <div className="bg-white rounded-[3rem] border border-slate-200 shadow-2xl overflow-hidden">
                    <div className="p-10 bg-slate-900 text-white flex justify-between items-center">
                        <div>
                            <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2">Variation Matrix</p>
                            <h3 className="text-3xl font-black tracking-tight">{selectedGroup}</h3>
                        </div>
                        <Database size={40} className="text-blue-500 opacity-20"/>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">
                                <tr>
                                    <th className="px-10 py-6">Identity</th>
                                    <th className="px-10 py-6">Material</th>
                                    <th className="px-10 py-6">Size</th>
                                    <th className="px-10 py-6 text-right">Physical Qty</th>
                                    <th className="px-10 py-6 text-center">Status</th>
                                    <th className="px-10 py-6 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item: any) => (
                                    <tr key={item.sku} className="border-b border-slate-50 hover:bg-blue-50/20 transition-all group">
                                        <td className="px-10 py-6 font-mono text-xs text-slate-400">{item.sku}</td>
                                        <td className="px-10 py-6 font-black text-slate-900">SS {item.grade}</td>
                                        <td className="px-10 py-6 font-black text-slate-700">{item.size}</td>
                                        <td className="px-10 py-6 text-right font-black text-slate-900 text-lg">{item.stock}</td>
                                        <td className="px-10 py-6 text-center">
                                            {item.stock < (item.initialStock * 0.1) ? <span className="px-4 py-2 bg-red-50 text-red-600 text-[10px] font-black rounded-full uppercase animate-pulse">Critical</span> : <span className="px-4 py-2 bg-emerald-50 text-emerald-600 text-[10px] font-black rounded-full uppercase tracking-widest">Stable</span>}
                                        </td>
                                        <td className="px-10 py-6 text-right">
                                            <button 
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    onDelete(item.sku);
                                                }}
                                                className="p-3 bg-red-600 text-white rounded-xl hover:bg-red-800 transition-all shadow-sm active:scale-95"
                                                title="Delete Variant"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    }

    // Main Family Grid view
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {Object.entries(grouped).map(([name, items]: any) => {
                const total = items.reduce((s: number, i: any) => s + (i.stock || 0), 0);
                const warning = items.some((i: any) => i.stock < (i.initialStock * 0.1));
                return (
                    <div key={name} className={`bg-white rounded-[2.5rem] border hover:shadow-2xl hover:-translate-y-2 transition-all group relative overflow-hidden flex flex-col ${warning ? 'border-red-100 ring-2 ring-red-50' : 'border-slate-200'}`}>
                        {warning && <div className="absolute top-0 right-0 bg-red-600 text-white px-6 py-2 text-[10px] font-black uppercase rounded-bl-2xl z-20">Restock</div>}
                        
                        {/* Red Delete Button (Family Purge) - Positioned and Z-indexed to be hit-testable */}
                        <button 
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                console.log("UI: Purge request for ->", name);
                                onDeleteCategory(name);
                            }}
                            className="absolute top-6 left-6 p-4 bg-red-600 text-white rounded-2xl hover:bg-red-800 transition-all shadow-xl z-[100] border-2 border-white/40 active:scale-90 flex items-center justify-center pointer-events-auto"
                            title="Delete All Variations of This Family"
                        >
                            <Trash2 size={24} />
                        </button>

                        <div className="p-10 flex-1 cursor-pointer pt-24" onClick={() => onGroupClick(name)}>
                            <div className="w-16 h-16 bg-slate-50 group-hover:bg-blue-600 group-hover:text-white rounded-2xl flex items-center justify-center mb-8 transition-all duration-300"><Layers size={32} /></div>
                            <h4 className="font-black text-slate-900 text-xl leading-tight mb-2 tracking-tight">{name}</h4>
                            <p className="text-[10px] text-blue-600 font-bold uppercase tracking-widest mb-6">{items.length} Variants Sync'd</p>
                            <div className="flex justify-between items-end border-t border-slate-50 pt-6">
                                <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sync'd Qty</p><p className={`text-2xl font-black ${warning ? 'text-red-600' : 'text-slate-900'}`}>{total}</p></div>
                                <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-blue-600 group-hover:text-white transition-all"><ChevronRight size={24} /></div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function CRMView({ customers, onGenerateChallan }: any) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {customers.map((c: any) => (
                <div key={c.id} className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm hover:shadow-2xl transition-all group relative overflow-hidden">
                    <div className="flex items-center gap-6 mb-10">
                        <div className="w-16 h-16 bg-slate-900 text-white rounded-2xl flex items-center justify-center text-2xl font-black shadow-xl">{(c.name || "C").charAt(0)}</div>
                        <div><h4 className="font-black text-slate-900 text-xl tracking-tight mb-1">{c.name}</h4><p className="text-xs text-slate-400 font-bold uppercase tracking-tighter">{c.orderHistory.length} Shipments Sync'd</p></div>
                    </div>
                    <div className="bg-slate-50 p-6 rounded-2xl mb-8 flex justify-between items-center text-sm">
                         <span className="font-bold text-slate-400 uppercase tracking-widest text-[9px]">LTV Value</span>
                         <span className="font-black text-blue-600 text-lg">${c.orderHistory.reduce((a:any, b:any) => a + (b.totalAmount || 0), 0).toLocaleString()}</span>
                    </div>
                    <button onClick={() => onGenerateChallan(c)} className="w-full py-5 bg-slate-900 text-white rounded-[1.5rem] font-black text-sm hover:bg-blue-600 shadow-xl active:scale-95 flex items-center justify-center gap-3">
                        <FileText size={20}/> GENERATE CHALLAN
                    </button>
                </div>
            ))}
            {customers.length === 0 && <div className="col-span-full py-32 text-center text-slate-400 font-black uppercase tracking-widest text-sm">Sync Awaiting Input...</div>}
        </div>
    );
}

function ProcessingResultCard({ result }: { result: ProcessingResult }) {
    if (!result || !result.affectedItems) return null;
    return (
        <div className="animate-in slide-in-from-bottom-12 duration-1000">
            <div className="bg-white rounded-[3.5rem] border border-slate-200 shadow-2xl overflow-hidden">
                <div className="p-12 bg-blue-600 text-white relative">
                    <div className="absolute top-0 right-0 p-12 opacity-10 rotate-12 scale-150"><ShieldCheck size={120}/></div>
                    <div className="flex justify-between items-start mb-10 relative">
                        <div className="p-5 bg-white/20 rounded-[2rem] backdrop-blur-2xl ring-1 ring-white/30"><FileCheck size={40} /></div>
                        <div className="bg-white/10 px-8 py-3 rounded-full text-[11px] font-black tracking-widest uppercase backdrop-blur-3xl border border-white/20">Operational Success</div>
                    </div>
                    <h3 className="text-5xl font-black tracking-tighter mb-4">Ledger Sync Success</h3>
                    <p className="text-blue-50 font-bold text-lg opacity-90 max-w-2xl leading-relaxed">{result.summary}</p>
                </div>
                <div className="p-16 space-y-16">
                    {result.alerts && result.alerts.length > 0 && (
                        <div className="space-y-4">
                            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-2">Engine System Alerts</p>
                            {result.alerts.map((a, i) => (
                                <div key={i} className="flex items-center gap-5 p-7 bg-amber-50 text-amber-900 rounded-[2rem] border border-amber-100 font-black text-sm shadow-sm"><AlertTriangle size={24} className="shrink-0 text-amber-500"/> {a}</div>
                            ))}
                        </div>
                    )}
                    <div className="space-y-8">
                        <div className="flex justify-between items-end px-2">
                             <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3"><History size={20} className="text-blue-500"/> Inventory Shift Ledger</p>
                             <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{result.affectedItems.length} Entities Affected</span>
                        </div>
                        <div className="rounded-[2.5rem] border border-slate-100 overflow-hidden shadow-sm bg-slate-50/30">
                            <table className="w-full text-left">
                                <thead className="bg-white text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">
                                    <tr><th className="px-10 py-7">Product Identity</th><th className="px-10 py-7 text-right">Prior</th><th className="px-10 py-7 text-right">Shift</th><th className="px-10 py-7 text-right">Current</th></tr>
                                </thead>
                                <tbody className="text-sm font-bold">
                                    {result.affectedItems.map(item => {
                                        const diff = item.newStock - item.previousStock;
                                        return (
                                            <tr key={item.sku} className="border-t border-slate-50 group hover:bg-white transition-all">
                                                <td className="px-10 py-7 font-mono text-xs text-slate-500 group-hover:text-blue-600">{item.sku}{item.previousStock === 0 && <span className="ml-4 text-[9px] font-black bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full uppercase tracking-tighter">New Entry</span>}</td>
                                                <td className="px-10 py-7 text-right text-slate-400">{item.previousStock}</td>
                                                <td className={`px-10 py-7 text-right font-black ${diff > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{diff > 0 ? '+' : ''}{diff}</td>
                                                <td className="px-10 py-7 text-right font-black text-slate-900 text-lg">{item.newStock}</td>
                                            </tr>
                                        );
                                    })}
                                    {result.affectedItems.length === 0 && <tr><td colSpan={4} className="px-10 py-12 text-center text-slate-400 italic font-medium">No state changes detected in this cycle.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    {result.customerInfo && (
                        <div className="p-10 bg-slate-900 rounded-[2.5rem] flex items-center justify-between text-white shadow-2xl group overflow-hidden relative">
                            <div className="flex items-center gap-8 relative"><div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center font-black text-3xl shadow-2xl">{(result.customerInfo.name || "C").charAt(0)}</div><div><h4 className="font-black text-2xl tracking-tight mb-2">{result.customerInfo.name}</h4><div className="flex gap-4"><span className="text-[10px] font-black text-blue-400 uppercase tracking-widest bg-blue-500/10 px-3 py-1 rounded-full ring-1 ring-blue-500/20">Profile Synchronized</span></div></div></div>
                            <CheckCircle2 size={48} className="text-blue-500 animate-in zoom-in-50 duration-500" />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function AddProductForm({ onAdd }: any) {
  const [formData, setFormData] = useState({ name: '', grade: '304', size: '', initialStock: '', price: '' });
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const stock = parseInt(formData.initialStock);
    const price = parseFloat(formData.price);
    if (!formData.name || !formData.size || isNaN(stock)) return;
    const sku = `${formData.name.substring(0,3).toUpperCase()}-${formData.grade}-${formData.size.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now().toString().slice(-4)}`;
    onAdd({ sku, name: formData.name, grade: formData.grade, size: formData.size, stock, initialStock: stock, price: price || 0 });
  };
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Product Label</label><input type="text" className="w-full p-4 border rounded-xl font-bold bg-slate-50" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required /></div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Grade</label><select className="w-full p-4 border rounded-xl font-bold bg-slate-50" value={formData.grade} onChange={e => setFormData({...formData, grade: e.target.value})}><option value="304">SS 304</option><option value="316">SS 316</option><option value="202">SS 202</option></select></div>
        <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Dimensions</label><input type="text" className="w-full p-4 border rounded-xl font-bold bg-slate-50" value={formData.size} onChange={e => setFormData({...formData, size: e.target.value})} required /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Initial Stock</label><input type="number" className="w-full p-4 border rounded-xl font-bold bg-slate-50" value={formData.initialStock} onChange={e => setFormData({...formData, initialStock: e.target.value})} required /></div>
        <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">List Price</label><input type="number" step="0.01" className="w-full p-4 border rounded-xl font-bold bg-slate-50" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} required /></div>
      </div>
      <button type="submit" className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black shadow-lg hover:bg-blue-600 transition-all active:scale-95">SYNC TO CATALOG</button>
    </form>
  );
}
