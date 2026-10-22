
void __thiscall FUN_00476973(void *this,HWND param_1)

{
  byte bVar1;
  uint uVar2;
  int extraout_ECX;
  char *pcVar3;
  uint local_1c;
  CHAR local_14 [16];
  
  bVar1 = FUN_004072bb(this);
  local_1c = (uint)bVar1;
  uVar2 = FUN_00419b76(this);
  if ((char)uVar2 != -1) {
    FUN_004061f9();
    bVar1 = FUN_00420aad(extraout_ECX);
    if (bVar1 != 3) {
      if (bVar1 < 4) {
        pcVar3 = s__u_____d___0048e72c;
      }
      else {
        pcVar3 = s__u_____d___0048ebc0;
      }
      FUN_00480422(local_14,pcVar3);
      SetDlgItemTextA(param_1,0x56b,local_14);
      goto LAB_004769fc;
    }
  }
  SetDlgItemInt(param_1,0x56b,local_1c,0);
LAB_004769fc:
  FUN_00419d35(param_1);
  return;
}

