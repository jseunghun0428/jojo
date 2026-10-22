
void __fastcall FUN_0045c697(int *param_1)

{
  ushort *this;
  byte bVar1;
  char cVar2;
  undefined1 uVar3;
  BOOL BVar4;
  uint *puVar5;
  uint uVar6;
  byte *pbVar7;
  LPCSTR pCVar8;
  uint uValue;
  UINT UVar9;
  undefined4 uVar10;
  undefined3 extraout_var;
  undefined3 extraout_var_00;
  
  if ((param_1[0x22] != 0) && (*(byte *)(param_1 + 2) != 0xff)) {
    this = *(ushort **)(*param_1 + (uint)*(byte *)(param_1 + 2) * 4);
    BVar4 = IsWindowVisible(DAT_004b7508);
    if (BVar4 != 0) {
      FUN_00412291(DAT_004b5e84,1);
    }
    puVar5 = (uint *)FUN_0040154a();
    uVar6 = FUN_0040765c(this);
    pbVar7 = (byte *)FUN_004789d6(uVar6,puVar5,0x60,0,&DAT_004ac538);
    FUN_0040f0f6(this);
    FUN_0047cae3(0x10);
    FUN_0047d1ca(7);
    FUN_0047d1f1(4,0x12,0);
    FUN_0047e09b((byte *)0x0,(HGLOBAL)0x0,DAT_004868e8,DAT_004868ec,pbVar7);
    FUN_0047cae3(0);
    pCVar8 = (LPCSTR)FUN_00407775((int)this);
    SetDlgItemTextA((HWND)param_1[0x22],0x473,pCVar8);
    FUN_00406610((int)this);
    pCVar8 = FUN_0040111a();
    SetDlgItemTextA((HWND)param_1[0x22],0x475,pCVar8);
    bVar1 = FUN_004065d0((int)this);
    SetDlgItemInt((HWND)param_1[0x22],0x3f7,(uint)bVar1,0);
    for (uVar6 = 0; (byte)uVar6 < 5; uVar6 = uVar6 + 1) {
      uValue = FUN_004070e1(this,(byte)uVar6,1);
      SetDlgItemInt((HWND)param_1[0x22],uVar6 + 0x3f8,uValue,0);
    }
    UVar9 = FUN_00407263(this);
    SetDlgItemInt((HWND)param_1[0x22],0x3fd,UVar9,0);
    uVar10 = FUN_00407263(this);
    FUN_00461448(param_1 + 0x45,uVar10,0,1000);
    UVar9 = FUN_0040728f(this);
    SetDlgItemInt((HWND)param_1[0x22],0x3fe,UVar9,0);
    uVar10 = FUN_0040728f(this);
    FUN_00461448(param_1 + 0x4d,uVar10,0,0xff);
    cVar2 = FUN_004065c7((int)this);
    if (cVar2 == -1) {
      SetDlgItemTextA((HWND)param_1[0x22],0x3ff,&DAT_00486ac7);
      FUN_00461448(param_1 + 0x55,100,0,100);
    }
    else {
      uVar3 = FUN_004065c7((int)this);
      SetDlgItemInt((HWND)param_1[0x22],0x3ff,CONCAT31(extraout_var,uVar3),0);
      uVar3 = FUN_004065c7((int)this);
      FUN_00461448(param_1 + 0x55,CONCAT31(extraout_var_00,uVar3),0,100);
    }
    for (uVar6 = uVar6 & 0xffffff00; (byte)uVar6 < 5; uVar6 = uVar6 + 1) {
      UVar9 = (*(code *)(&PTR_FUN_00430000)[uVar6])();
      SetDlgItemInt((HWND)param_1[0x22],uVar6 + 0x400,UVar9,0);
      FUN_00461448(param_1 + uVar6 * 8 + 0x5d,UVar9,0,0x4b0);
    }
    uVar6 = FUN_004072bb(this);
    SetDlgItemInt((HWND)param_1[0x22],0x405,uVar6 & 0xff,0);
    FUN_0042122b((int)param_1);
  }
  return;
}

