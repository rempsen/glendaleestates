import { useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { useUpgradePricing } from '@/hooks/useUpgradePricing';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Plus, 
  Copy, 
  Trash2, 
  Save, 
  DollarSign, 
  Percent, 
  Package, 
  Settings, 
  Eye, 
  EyeOff,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';

const UNIT_TYPE_LABELS: Record<string, string> = {
  sqft: 'per sq ft',
  sqyd: 'per sq yd',
  flat: 'Flat Fee',
};

export default function AdminPricingControl() {
  const {
    materials,
    pricingConfig,
    lineItems,
    loading,
    saving,
    refetch,
    updateMaterial,
    addMaterial,
    deleteMaterial,
    duplicateMaterial,
    updatePricingConfig,
    addLineItem,
    updateLineItem,
    deleteLineItem,
    getMarkupPercentage,
    getGstRate,
  } = useUpgradePricing();

  const [isAddMaterialOpen, setIsAddMaterialOpen] = useState(false);
  const [isAddLineItemOpen, setIsAddLineItemOpen] = useState(false);
  const [newMaterial, setNewMaterial] = useState({
    material_key: '',
    name: '',
    description: '',
    cost_per_unit: 0,
    unit_type: 'sqft' as 'sqft' | 'sqyd' | 'flat',
    is_active: true,
    display_order: 0,
    parent_material_key: null as string | null,
  });
  const [newLineItem, setNewLineItem] = useState({
    name: '',
    description: '',
    cost: 0,
    cost_type: 'flat' as 'flat' | 'per_unit' | 'percentage',
    apply_to_material_key: null as string | null,
    blend_into_material: false,
    is_active: true,
    display_order: 0,
  });

  const handleAddMaterial = async () => {
    if (!newMaterial.material_key || !newMaterial.name) {
      toast.error('Please fill in required fields');
      return;
    }
    const result = await addMaterial(newMaterial);
    if (result) {
      setIsAddMaterialOpen(false);
      setNewMaterial({
        material_key: '',
        name: '',
        description: '',
        cost_per_unit: 0,
        unit_type: 'sqft',
        is_active: true,
        display_order: 0,
        parent_material_key: null,
      });
    }
  };

  const handleAddLineItem = async () => {
    if (!newLineItem.name) {
      toast.error('Please enter a name');
      return;
    }
    const result = await addLineItem(newLineItem);
    if (result) {
      setIsAddLineItemOpen(false);
      setNewLineItem({
        name: '',
        description: '',
        cost: 0,
        cost_type: 'flat',
        apply_to_material_key: null,
        blend_into_material: false,
        is_active: true,
        display_order: 0,
      });
    }
  };

  const calculateCustomerPrice = (baseCost: number, unitType: string) => {
    if (unitType === 'flat') {
      // Flat fees like grout color don't get markup
      const gst = baseCost * getGstRate();
      return baseCost + gst;
    }
    const markedUp = baseCost * (1 + getMarkupPercentage());
    const gst = markedUp * getGstRate();
    return markedUp + gst;
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  const markupConfig = pricingConfig.find(c => c.config_key === 'markup_percentage');
  const gstConfig = pricingConfig.find(c => c.config_key === 'gst_rate');

  // Group materials by parent
  const parentMaterials = materials.filter(m => !m.parent_material_key);
  const childMaterials = materials.filter(m => m.parent_material_key);

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Upgrade Pricing Control</h1>
            <p className="text-muted-foreground">
              Manage material costs, markup, and additional fees. All calculations are hidden from clients.
            </p>
          </div>
          <Button variant="outline" onClick={refetch} disabled={saving}>
            <RefreshCw className={`h-4 w-4 mr-2 ${saving ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Global Pricing Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Global Pricing Settings
            </CardTitle>
            <CardDescription>
              These settings apply to all material calculations (hidden from clients)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Markup Percentage */}
              <div className="space-y-2">
                <Label htmlFor="markup" className="flex items-center gap-2">
                  <Percent className="h-4 w-4" />
                  Markup Percentage
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="markup"
                    type="number"
                    min="0"
                    max="500"
                    value={markupConfig?.config_value || 60}
                    onChange={(e) => {
                      if (markupConfig) {
                        updatePricingConfig(markupConfig.id, parseFloat(e.target.value) || 0);
                      }
                    }}
                    className="w-32"
                  />
                  <span className="text-muted-foreground">%</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Applied to base cost before GST (e.g., 60% markup means base × 1.60)
                </p>
              </div>

              {/* GST Rate */}
              <div className="space-y-2">
                <Label htmlFor="gst" className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  GST Rate
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="gst"
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={gstConfig?.config_value || 5}
                    onChange={(e) => {
                      if (gstConfig) {
                        updatePricingConfig(gstConfig.id, parseFloat(e.target.value) || 0);
                      }
                    }}
                    className="w-32"
                  />
                  <span className="text-muted-foreground">%</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Applied to final marked-up price
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Materials Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Upgrade Materials
                </CardTitle>
                <CardDescription>
                  Configure pricing per unit for each material type. Add variants by duplicating.
                </CardDescription>
              </div>
              <Dialog open={isAddMaterialOpen} onOpenChange={setIsAddMaterialOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Material
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Material</DialogTitle>
                    <DialogDescription>
                      Create a new upgrade material option
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="newMaterialKey">Material Key *</Label>
                        <Input
                          id="newMaterialKey"
                          placeholder="e.g., lvp_premium"
                          value={newMaterial.material_key}
                          onChange={(e) => setNewMaterial(prev => ({ ...prev, material_key: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="newMaterialName">Display Name *</Label>
                        <Input
                          id="newMaterialName"
                          placeholder="e.g., Premium LVP"
                          value={newMaterial.name}
                          onChange={(e) => setNewMaterial(prev => ({ ...prev, name: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="newMaterialDesc">Description</Label>
                      <Textarea
                        id="newMaterialDesc"
                        placeholder="Brief description of the upgrade..."
                        value={newMaterial.description}
                        onChange={(e) => setNewMaterial(prev => ({ ...prev, description: e.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="newMaterialCost">Base Cost</Label>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">$</span>
                          <Input
                            id="newMaterialCost"
                            type="number"
                            min="0"
                            step="0.01"
                            value={newMaterial.cost_per_unit}
                            onChange={(e) => setNewMaterial(prev => ({ ...prev, cost_per_unit: parseFloat(e.target.value) || 0 }))}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="newMaterialUnit">Unit Type</Label>
                        <Select
                          value={newMaterial.unit_type}
                          onValueChange={(value: 'sqft' | 'sqyd' | 'flat') => setNewMaterial(prev => ({ ...prev, unit_type: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sqft">Per Sq Ft</SelectItem>
                            <SelectItem value="sqyd">Per Sq Yd</SelectItem>
                            <SelectItem value="flat">Flat Fee</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="newMaterialParent">Parent Material (Optional)</Label>
                      <Select
                        value={newMaterial.parent_material_key || 'none'}
                        onValueChange={(value) => setNewMaterial(prev => ({ ...prev, parent_material_key: value === 'none' ? null : value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select parent..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No Parent (Top Level)</SelectItem>
                          {parentMaterials.map(m => (
                            <SelectItem key={m.id} value={m.material_key}>{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Group as a variant under an existing material
                      </p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddMaterialOpen(false)}>Cancel</Button>
                    <Button onClick={handleAddMaterial} disabled={saving}>
                      {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Add Material
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead>Base Cost</TableHead>
                  <TableHead>Customer Price</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materials.map((material) => {
                  const isChild = !!material.parent_material_key;
                  const customerPrice = calculateCustomerPrice(material.cost_per_unit, material.unit_type);
                  
                  return (
                    <TableRow key={material.id} className={isChild ? 'bg-muted/30' : ''}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className={`font-medium ${isChild ? 'pl-4' : ''}`}>
                            {isChild && '↳ '}{material.name}
                          </span>
                          <span className="text-xs text-muted-foreground">{material.material_key}</span>
                          {material.description && (
                            <span className="text-xs text-muted-foreground">{material.description}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">$</span>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={material.cost_per_unit}
                            onChange={(e) => updateMaterial(material.id, { cost_per_unit: parseFloat(e.target.value) || 0 })}
                            className="w-24"
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold text-primary">
                          ${customerPrice.toFixed(2)}
                        </span>
                        <span className="text-xs text-muted-foreground ml-1">
                          (incl. {getMarkupPercentage() * 100}% + GST)
                        </span>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={material.unit_type}
                          onValueChange={(value: 'sqft' | 'sqyd' | 'flat') => updateMaterial(material.id, { unit_type: value })}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sqft">Per Sq Ft</SelectItem>
                            <SelectItem value="sqyd">Per Sq Yd</SelectItem>
                            <SelectItem value="flat">Flat Fee</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={material.is_active}
                            onCheckedChange={(checked) => updateMaterial(material.id, { is_active: checked })}
                          />
                          <Badge variant={material.is_active ? 'default' : 'secondary'}>
                            {material.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => duplicateMaterial(material)}
                            title="Duplicate material"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteMaterial(material.id)}
                            title="Delete material"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Additional Line Items */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Additional Line Items
                </CardTitle>
                <CardDescription>
                  Add one-time costs or fees. Can be shown separately or blended into material costs.
                </CardDescription>
              </div>
              <Dialog open={isAddLineItemOpen} onOpenChange={setIsAddLineItemOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Line Item
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Line Item</DialogTitle>
                    <DialogDescription>
                      Create an additional cost or fee
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="newLineItemName">Name *</Label>
                      <Input
                        id="newLineItemName"
                        placeholder="e.g., Installation Fee"
                        value={newLineItem.name}
                        onChange={(e) => setNewLineItem(prev => ({ ...prev, name: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="newLineItemDesc">Description</Label>
                      <Textarea
                        id="newLineItemDesc"
                        placeholder="Optional description..."
                        value={newLineItem.description}
                        onChange={(e) => setNewLineItem(prev => ({ ...prev, description: e.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="newLineItemCost">Cost</Label>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">$</span>
                          <Input
                            id="newLineItemCost"
                            type="number"
                            min="0"
                            step="0.01"
                            value={newLineItem.cost}
                            onChange={(e) => setNewLineItem(prev => ({ ...prev, cost: parseFloat(e.target.value) || 0 }))}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="newLineItemType">Cost Type</Label>
                        <Select
                          value={newLineItem.cost_type}
                          onValueChange={(value: 'flat' | 'per_unit' | 'percentage') => setNewLineItem(prev => ({ ...prev, cost_type: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="flat">Flat Fee</SelectItem>
                            <SelectItem value="per_unit">Per Unit (sq ft/yd)</SelectItem>
                            <SelectItem value="percentage">Percentage of Total</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="newLineItemMaterial">Apply to Material (Optional)</Label>
                      <Select
                        value={newLineItem.apply_to_material_key || 'all'}
                        onValueChange={(value) => setNewLineItem(prev => ({ ...prev, apply_to_material_key: value === 'all' ? null : value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select material..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Materials</SelectItem>
                          {materials.map(m => (
                            <SelectItem key={m.id} value={m.material_key}>{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="newLineItemBlend"
                        checked={newLineItem.blend_into_material}
                        onCheckedChange={(checked) => setNewLineItem(prev => ({ ...prev, blend_into_material: checked }))}
                      />
                      <Label htmlFor="newLineItemBlend" className="flex items-center gap-2">
                        <EyeOff className="h-4 w-4" />
                        Blend into material cost (hide from client)
                      </Label>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddLineItemOpen(false)}>Cancel</Button>
                    <Button onClick={handleAddLineItem} disabled={saving}>
                      {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Add Line Item
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {lineItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No additional line items configured</p>
                <p className="text-sm">Add fees like installation, delivery, or percentage-based costs</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Applies To</TableHead>
                    <TableHead>Visibility</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{item.name}</span>
                          {item.description && (
                            <span className="text-xs text-muted-foreground">{item.description}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">$</span>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.cost}
                            onChange={(e) => updateLineItem(item.id, { cost: parseFloat(e.target.value) || 0 })}
                            className="w-24"
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={item.cost_type}
                          onValueChange={(value: 'flat' | 'per_unit' | 'percentage') => updateLineItem(item.id, { cost_type: value })}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="flat">Flat Fee</SelectItem>
                            <SelectItem value="per_unit">Per Unit</SelectItem>
                            <SelectItem value="percentage">Percentage</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {item.apply_to_material_key 
                            ? materials.find(m => m.material_key === item.apply_to_material_key)?.name || item.apply_to_material_key
                            : 'All Materials'
                          }
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={item.blend_into_material}
                            onCheckedChange={(checked) => updateLineItem(item.id, { blend_into_material: checked })}
                          />
                          {item.blend_into_material ? (
                            <Badge variant="secondary" className="flex items-center gap-1">
                              <EyeOff className="h-3 w-3" />
                              Hidden
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              Visible
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={item.is_active}
                            onCheckedChange={(checked) => updateLineItem(item.id, { is_active: checked })}
                          />
                          <Badge variant={item.is_active ? 'default' : 'secondary'}>
                            {item.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteLineItem(item.id)}
                          title="Delete line item"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Preview Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Pricing Preview
            </CardTitle>
            <CardDescription>
              Example calculations showing how prices appear to clients
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {materials.filter(m => m.is_active).slice(0, 6).map((material) => {
                const exampleArea = material.unit_type === 'sqyd' ? 25 : 200;
                const baseCost = material.unit_type === 'flat' ? material.cost_per_unit : material.cost_per_unit * exampleArea;
                const markedUp = material.unit_type === 'flat' ? baseCost : baseCost * (1 + getMarkupPercentage());
                const gst = markedUp * getGstRate();
                const total = markedUp + gst;
                
                return (
                  <div key={material.id} className="p-4 border rounded-lg bg-muted/30">
                    <h4 className="font-medium">{material.name}</h4>
                    <p className="text-xs text-muted-foreground mb-2">
                      {material.unit_type === 'flat' 
                        ? 'Flat fee' 
                        : `Example: ${exampleArea} ${material.unit_type === 'sqyd' ? 'sq yd' : 'sq ft'}`
                      }
                    </p>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Base:</span>
                        <span>${baseCost.toFixed(2)}</span>
                      </div>
                      {material.unit_type !== 'flat' && (
                        <div className="flex justify-between text-muted-foreground">
                          <span>+ Markup ({getMarkupPercentage() * 100}%):</span>
                          <span>${(markedUp - baseCost).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-muted-foreground">
                        <span>+ GST ({getGstRate() * 100}%):</span>
                        <span>${gst.toFixed(2)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-semibold text-primary">
                        <span>Client Sees:</span>
                        <span>${total.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
