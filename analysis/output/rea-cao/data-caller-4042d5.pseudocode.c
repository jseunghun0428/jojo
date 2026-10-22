
void FUN_004042d5(int param_1)

{
  undefined *puVar1;
  undefined1 *puVar2;
  uint local_c;
  uint local_8;
  
  local_8 = 0;
  local_c = 0;
  puVar2 = (undefined1 *)FUN_0040159c();
  FUN_0041b51e((uint *)s_DATA_E5_0048bb60,0,puVar2);
  for (; local_8 < 2; local_8 = local_8 + 1) {
    for (local_c = local_c & 0xffffff00; (byte)local_c < *(byte *)(local_8 + param_1);
        local_c = local_c + 1) {
      if (local_8 == 1) {
        puVar1 = &DAT_00511d00;
      }
      else {
        puVar1 = &DAT_00510d00;
      }
      FUN_00426e1a((uint)*(ushort *)(puVar1 + local_c * 0x10),
                   (int)(puVar2 + (uint)*(ushort *)(puVar1 + local_c * 0x10) * 0x20 + -2),1);
    }
  }
  return;
}

