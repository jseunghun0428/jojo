
int __fastcall FUN_0040a72c(int param_1)

{
  byte bVar1;
  byte *pbVar2;
  byte *local_c;
  int local_8;
  
  local_8 = 0;
  local_c = (byte *)(param_1 + 0x10);
  while( true ) {
    bVar1 = *local_c;
    pbVar2 = local_c;
    if ((bVar1 == 0) || ((0x2f < bVar1 && (bVar1 < 0x3a)))) break;
    pbVar2 = (byte *)(param_1 + local_8);
    pbVar2[0x3f] = *local_c;
    local_8 = local_8 + 1;
    if (4 < local_8) break;
    local_c = local_c + 1;
  }
  pbVar2[0x2f] = 0;
  return param_1 + local_8;
}

