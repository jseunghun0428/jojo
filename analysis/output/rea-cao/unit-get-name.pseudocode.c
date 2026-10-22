
int __fastcall FUN_00407775(int param_1)

{
  byte bVar1;
  byte *local_c;
  int local_8;
  
  local_8 = 0;
  local_c = (byte *)(param_1 + 8);
  while( true ) {
    bVar1 = *local_c;
    if ((bVar1 == 0) || ((bVar1 < 0x3a && (0x2f < bVar1)))) break;
    *(byte *)(param_1 + local_8 + 0x37) = *local_c;
    local_8 = local_8 + 1;
    if (7 < local_8) break;
    local_c = local_c + 1;
  }
  if (local_8 != 8) {
    *(undefined1 *)(param_1 + 0x37 + local_8) = 0;
  }
  return param_1 + 0x37;
}

