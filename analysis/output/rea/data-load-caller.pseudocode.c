
void FUN_004010b0(void)

{
  undefined1 uVar1;
  int extraout_ECX;
  int iVar2;
  undefined4 uVar3;
  
  FUN_0041b51e((uint *)s_DATA_E5_0048bb60,1,&DAT_004a1140);
  FUN_00451313(&DAT_004a1b68,s_star_e5_0048c530);
  uVar3 = 0xff;
  for (iVar2 = 0; (byte)iVar2 < (byte)uVar3; iVar2 = iVar2 + 1) {
    FUN_004837c2();
    *(undefined1 *)(extraout_ECX + 0xe) = 0;
    uVar1 = *(undefined1 *)(extraout_ECX + 0x12);
    *(short *)(extraout_ECX + 0x12) = (short)*(undefined4 *)(extraout_ECX + 0x13);
    *(undefined1 *)(extraout_ECX + 0x14) = uVar1;
  }
  FUN_00427a98();
  return;
}

