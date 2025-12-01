import FormulaEditorClient from './FormulaEditorClient';

export const metadata = {
  title: 'Formula Editor',
};

export default function ConfigEditorPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Formula Editor</h1>
      <FormulaEditorClient />
    </div>
  );
}
