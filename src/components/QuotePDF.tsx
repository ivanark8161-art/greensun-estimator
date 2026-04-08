import { useState } from 'react';
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  pdf,
} from '@react-pdf/renderer';
import type { EstimateLineItem } from '../types';

// ── Styles ────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page:            { fontFamily: 'Helvetica', fontSize: 9, color: '#111', backgroundColor: '#fff', padding: 0 },

  // Header band
  header:          { flexDirection: 'row', alignItems: 'center', padding: '20 28', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  logo:            { width: 54, height: 54, marginRight: 14 },
  companyBlock:    { flex: 1 },
  companyName:     { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#111' },
  companyAddr:     { fontSize: 8, color: '#555', marginTop: 3, lineHeight: 1.5 },

  // Recipient + estimate meta row
  recipientRow:    { flexDirection: 'row', padding: '18 28 14 28', gap: 20 },
  recipientBlock:  { flex: 1 },
  recipientLabel:  { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  recipientName:   { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#111', marginBottom: 3 },
  recipientAddr:   { fontSize: 8.5, color: '#444', lineHeight: 1.6 },

  // Estimate meta box
  metaBox:         { width: 180, border: '1 solid #d1d5db', borderRadius: 4, overflow: 'hidden' },
  metaHeader:      { backgroundColor: '#374151', padding: '8 12', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaHeaderText:  { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#fff' },
  metaRow:         { flexDirection: 'row', justifyContent: 'space-between', padding: '7 12', borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  metaLabel:       { fontSize: 8.5, color: '#6b7280' },
  metaValue:       { fontSize: 8.5, color: '#111' },
  metaTotalRow:    { flexDirection: 'row', justifyContent: 'space-between', padding: '9 12', borderTopWidth: 1, borderTopColor: '#e5e7eb', backgroundColor: '#f9fafb' },
  metaTotalLabel:  { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#111' },
  metaTotalValue:  { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#111' },

  // Line items table
  table:           { marginHorizontal: 28, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  tableHeader:     { flexDirection: 'row', backgroundColor: '#374151', padding: '8 10' },
  thWide:          { flex: 7, fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#fff' },
  thProduct:       { flex: 2, fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#fff' },
  thDesc:          { flex: 4, fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#fff' },
  thTotal:         { width: 70, fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#fff', textAlign: 'right' },

  // Section divider row
  sectionRow:      { flexDirection: 'row', backgroundColor: '#f3f4f6', padding: '4 10' },
  sectionLabel:    { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#6b7280', letterSpacing: 0.8, textTransform: 'uppercase' },

  // Data rows
  dataRow:         { flexDirection: 'row', padding: '9 10', borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  dataRowAlt:      { flexDirection: 'row', padding: '9 10', borderTopWidth: 1, borderTopColor: '#f3f4f6', backgroundColor: '#fafafa' },
  tdProduct:       { flex: 2, paddingRight: 8 },
  tdDesc:          { flex: 4, paddingRight: 8 },
  tdWide:          { flex: 7, paddingRight: 8 },
  tdTotal:         { width: 70, textAlign: 'right' },
  itemName:        { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#111', marginBottom: 2 },
  descText:        { fontSize: 8, color: '#444', lineHeight: 1.5 },
  totalText:       { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#111' },

  // Footer total rows
  footerRow:       { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 28, paddingTop: 6, paddingBottom: 4, borderTopWidth: 2, borderTopColor: '#e5e7eb', marginHorizontal: 28 },
  footerRowSub:    { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 28, paddingTop: 5, paddingBottom: 5, marginHorizontal: 28 },
  footerLabel:     { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#111', marginRight: 24 },
  footerLabelSub:  { fontSize: 9, color: '#6b7280', marginRight: 24 },
  footerValue:     { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#111', width: 70, textAlign: 'right' },
  footerValueSub:  { fontSize: 9, color: '#6b7280', width: 70, textAlign: 'right' },

  // Optional add-ons section
  optionalHeader:  { flexDirection: 'row', backgroundColor: '#f0fdf4', padding: '5 10', borderTopWidth: 1, borderTopColor: '#d1fae5' },
  optionalLabel:   { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#15803d', letterSpacing: 0.8, textTransform: 'uppercase' },

  // Notes / terms
  notesSection:    { marginHorizontal: 28, marginTop: 16 },
  notesLabel:      { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#888', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 },
  notesText:       { fontSize: 8, color: '#444', lineHeight: 1.6 },
  termsText:       { fontSize: 7.5, color: '#9ca3af', lineHeight: 1.6, marginTop: 10 },
});

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);
}

const SNOW_IDS = new Set(['svc16','svc17','svc18','svc19','svc20','snow_trip']);
function isSnow(i: EstimateLineItem) {
  return SNOW_IDS.has(i.catalogItemId ?? '') || i.isSnowPerTrip === true;
}

// ── PDF Document ──────────────────────────────────────────────────────────────
interface QuotePDFDocProps {
  estimateNumber: string;
  clientName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lineItems: EstimateLineItem[];
  jobType: 'maintenance' | 'landscaping';
  totalDue: number;       // base total (non-optional items only)
  monthlyBilling: number;
  sentDate: string;
  notes: string;
  terms: string;
  logoUrl: string;
}

function QuotePDFDoc({
  estimateNumber, clientName, address, city, state, zip,
  lineItems, jobType, totalDue, monthlyBilling, sentDate, notes, terms, logoUrl,
}: QuotePDFDocProps) {
  const isMaintenance = jobType === 'maintenance';
  const locationLine  = [city, state && zip ? `${state} ${zip}` : state || zip].filter(Boolean).join(', ');

  // ── Maintenance rendering groups ──
  const maintItems = lineItems.filter(i => !isSnow(i));
  const snowItems  = lineItems.filter(i => isSnow(i));

  // ── Landscaping rendering groups ──
  const requiredItems  = lineItems.filter(i => !i.optional);
  const optionalItems  = lineItems.filter(i => i.optional);
  const optionalTotal  = optionalItems.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const totalWithOpts  = totalDue + optionalTotal;
  const hasOptionals   = optionalItems.length > 0;

  return (
    <Document title={`Estimate #${estimateNumber} - ${clientName}`}>
      <Page size="LETTER" style={S.page}>

        {/* ── Header ── */}
        <View style={S.header}>
          <Image style={S.logo} src={logoUrl} />
          <View style={S.companyBlock}>
            <Text style={S.companyName}>GreenSun Landscapes LLC</Text>
            <Text style={S.companyAddr}>
              7221 Chicago Avenue  |  Minneapolis, Minnesota 55423{'\n'}
              715-347-2340  |  info@greensun.co  |  www.greensun.co
            </Text>
          </View>
        </View>

        {/* ── Recipient + Meta ── */}
        <View style={S.recipientRow}>
          <View style={S.recipientBlock}>
            <Text style={S.recipientLabel}>Recipient</Text>
            <Text style={S.recipientName}>{clientName || 'Client'}</Text>
            {address
              ? <Text style={S.recipientAddr}>{address}{'\n'}{locationLine}</Text>
              : locationLine
                ? <Text style={S.recipientAddr}>{locationLine}</Text>
                : null}
          </View>

          <View style={S.metaBox}>
            <View style={S.metaHeader}>
              <Text style={S.metaHeaderText}>Estimate #{estimateNumber}</Text>
            </View>
            <View style={S.metaRow}>
              <Text style={S.metaLabel}>Sent on</Text>
              <Text style={S.metaValue}>{sentDate}</Text>
            </View>
            {/* Maintenance: monthly rate. Landscaping: base total + optional total if applicable */}
            {isMaintenance ? (
              <View style={S.metaTotalRow}>
                <Text style={S.metaTotalLabel}>Monthly Rate</Text>
                <Text style={S.metaTotalValue}>{fmt(Math.ceil(monthlyBilling))}/mo</Text>
              </View>
            ) : (
              <>
                <View style={S.metaTotalRow}>
                  <Text style={S.metaTotalLabel}>Base Total</Text>
                  <Text style={S.metaTotalValue}>{fmt(totalDue)}</Text>
                </View>
                {hasOptionals && (
                  <View style={S.metaRow}>
                    <Text style={S.metaLabel}>With Options</Text>
                    <Text style={S.metaValue}>{fmt(totalWithOpts)}</Text>
                  </View>
                )}
              </>
            )}
          </View>
        </View>

        {/* ── MAINTENANCE: grouped maintenance + snow items ── */}
        {isMaintenance && (
          <View style={S.table}>
            <View style={S.tableHeader}>
              <Text style={S.thProduct}>Product/Service</Text>
              <Text style={{ flex: 5, fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#fff' }}>Description</Text>
            </View>
            {maintItems.length > 0 && (
              <>
                {snowItems.length > 0 && (
                  <View style={S.sectionRow}><Text style={S.sectionLabel}>Maintenance</Text></View>
                )}
                {maintItems.map((item, i) => (
                  <View key={item.id} style={i % 2 === 0 ? S.dataRow : S.dataRowAlt}>
                    <View style={S.tdProduct}>
                      <Text style={S.itemName}>{item.name}</Text>
                    </View>
                    <View style={{ flex: 5, paddingRight: 8 }}>
                      {item.description ? <Text style={S.descText}>{item.description}</Text> : null}
                    </View>
                  </View>
                ))}
              </>
            )}
            {snowItems.length > 0 && (
              <>
                <View style={S.sectionRow}><Text style={S.sectionLabel}>Snow Removal</Text></View>
                {snowItems.map((item, i) => (
                  <View key={item.id} style={i % 2 === 0 ? S.dataRow : S.dataRowAlt}>
                    <View style={S.tdProduct}>
                      <Text style={S.itemName}>{item.name}</Text>
                    </View>
                    <View style={{ flex: 5, paddingRight: 8 }}>
                      {item.description ? <Text style={S.descText}>{item.description}</Text> : null}
                    </View>
                  </View>
                ))}
              </>
            )}
          </View>
        )}

        {/* ── LANDSCAPING: required items (no price) ── */}
        {!isMaintenance && (
          <View style={S.table}>
            <View style={S.tableHeader}>
              <Text style={S.thProduct}>Product/Service</Text>
              <Text style={S.thWide}>Description</Text>
            </View>
            {requiredItems.map((item, i) => (
              <View key={item.id} style={i % 2 === 0 ? S.dataRow : S.dataRowAlt}>
                <View style={S.tdProduct}>
                  <Text style={S.itemName}>{item.name}</Text>
                </View>
                <View style={S.tdWide}>
                  {item.description ? <Text style={S.descText}>{item.description}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── LANDSCAPING: base total footer ── */}
        {!isMaintenance && (
          <View style={S.footerRow}>
            <Text style={S.footerLabel}>Base Total</Text>
            <Text style={S.footerValue}>{fmt(totalDue)}</Text>
          </View>
        )}

        {/* ── LANDSCAPING: optional add-ons ── */}
        {!isMaintenance && hasOptionals && (
          <>
            <View style={[S.table, { marginTop: 14 }]}>
              <View style={S.tableHeader}>
                <Text style={S.thProduct}>Optional Add-Ons</Text>
                <Text style={S.thDesc}>Description</Text>
                <Text style={S.thTotal}>Total</Text>
              </View>
              <View style={S.optionalHeader}>
                <Text style={S.optionalLabel}>Select any of the following to add to your project</Text>
              </View>
              {optionalItems.map((item, i) => (
                <View key={item.id} style={i % 2 === 0 ? S.dataRow : S.dataRowAlt}>
                  <View style={S.tdProduct}>
                    <Text style={S.itemName}>{item.name}</Text>
                  </View>
                  <View style={S.tdDesc}>
                    {item.description ? <Text style={S.descText}>{item.description}</Text> : null}
                  </View>
                  <View style={S.tdTotal}>
                    <Text style={S.totalText}>{fmt(item.qty * item.unitPrice)}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Sub-rows: base + total with options */}
            <View style={S.footerRowSub}>
              <Text style={S.footerLabelSub}>Base Total</Text>
              <Text style={S.footerValueSub}>{fmt(totalDue)}</Text>
            </View>
            <View style={S.footerRow}>
              <Text style={S.footerLabel}>Total with Options</Text>
              <Text style={S.footerValue}>{fmt(totalWithOpts)}</Text>
            </View>
          </>
        )}

        {/* ── MAINTENANCE: monthly rate footer ── */}
        {isMaintenance && (
          <View style={S.footerRow}>
            <Text style={S.footerLabel}>Monthly Rate</Text>
            <Text style={S.footerValue}>{fmt(Math.ceil(monthlyBilling))}/mo</Text>
          </View>
        )}

        {/* ── Notes & Terms ── */}
        {(notes || terms) && (
          <View style={S.notesSection}>
            {notes && (
              <>
                <Text style={S.notesLabel}>Notes</Text>
                <Text style={S.notesText}>{notes}</Text>
              </>
            )}
            {terms && <Text style={S.termsText}>Terms: {terms}</Text>}
          </View>
        )}

      </Page>
    </Document>
  );
}

// ── Download Button ───────────────────────────────────────────────────────────
interface DownloadButtonProps {
  estimateNumber: string;
  clientName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lineItems: EstimateLineItem[];
  jobType: 'maintenance' | 'landscaping';
  totalDue: number;
  monthlyBilling: number;
  createdAt: string;
  notes: string;
  terms: string;
}

export default function QuotePDFButton({
  estimateNumber, clientName, address, city, state, zip,
  lineItems, jobType, totalDue, monthlyBilling, createdAt, notes, terms,
}: DownloadButtonProps) {
  const [generating, setGenerating] = useState(false);

  const logoUrl = `${window.location.origin}/logo.png`;
  const sentDate = createdAt
    ? new Date(createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const fileName = `GreenSun-Estimate-${estimateNumber}-${clientName.replace(/\s+/g, '-')}.pdf`;

  async function handleClick() {
    setGenerating(true);
    try {
      const doc = (
        <QuotePDFDoc
          estimateNumber={estimateNumber}
          clientName={clientName}
          address={address}
          city={city}
          state={state}
          zip={zip}
          lineItems={lineItems}
          jobType={jobType}
          totalDue={totalDue}
          monthlyBilling={monthlyBilling}
          sentDate={sentDate}
          notes={notes}
          terms={terms}
          logoUrl={logoUrl}
        />
      );
      const blob = await pdf(doc).toBlob();
      const api = (window as any).electronAPI;
      if (api?.savePDF) {
        // Electron: save to Downloads folder and open
        const arrayBuffer = await blob.arrayBuffer();
        await api.savePDF(fileName, Array.from(new Uint8Array(arrayBuffer)));
      } else {
        // Browser: trigger download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setGenerating(false);
    }
  }

  return (
    <button
      className="btn-secondary text-sm px-4 py-1.5 flex items-center gap-1.5"
      disabled={generating}
      onClick={handleClick}
    >
      {generating ? (
        <span className="text-gray-400">Generating…</span>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          </svg>
          PDF
        </>
      )}
    </button>
  );
}
